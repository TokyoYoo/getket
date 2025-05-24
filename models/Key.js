const mongoose = require('mongoose');

const keySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  fingerprint: {
    type: String,
    required: true,
    index: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // MongoDB TTL index
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Method to check if key is expired
keySchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Method to get remaining time
keySchema.methods.getRemainingTime = function() {
  const now = new Date();
  const remaining = this.expiresAt - now;
  
  if (remaining <= 0) {
    return 'Expired';
  }
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
};

// Method to update last accessed time
keySchema.methods.updateLastAccessed = function() {
  this.lastAccessed = new Date();
  return this.save();
};

// Static method to generate unique key
keySchema.statics.generateUniqueKey = async function() {
  let key;
  let exists = true;
  
  while (exists) {
    // Generate random key (alphanumeric, 32 characters)
    key = Math.random().toString(36).substring(2, 15) + 
          Math.random().toString(36).substring(2, 15) + 
          Math.random().toString(36).substring(2, 6);
    
    const existingKey = await this.findOne({ key: key });
    exists = !!existingKey;
  }
  
  return key;
};

// Static method to cleanup expired keys and sessions
keySchema.statics.cleanupExpiredKeys = async function() {
  try {
    const expiredKeys = await this.find({ expiresAt: { $lte: new Date() } });
    const sessionIds = expiredKeys.map(key => key.sessionId);
    
    // Delete expired keys
    await this.deleteMany({ expiresAt: { $lte: new Date() } });
    
    // Clean sessions for expired keys
    if (sessionIds.length > 0) {
      const mongoose = require('mongoose');
      const sessionCollection = mongoose.connection.db.collection('sessions');
      await sessionCollection.deleteMany({ _id: { $in: sessionIds } });
    }
    
    console.log(`Cleaned up ${expiredKeys.length} expired keys and their sessions`);
    return { deletedKeys: expiredKeys.length, deletedSessions: sessionIds.length };
  } catch (error) {
    console.error('Error cleaning up expired keys:', error);
    throw error;
  }
};

// Static method to cleanup unused sessions (no key generated within 1 hour)
keySchema.statics.cleanupUnusedSessions = async function() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const mongoose = require('mongoose');
    const sessionCollection = mongoose.connection.db.collection('sessions');
    
    // Find sessions older than 1 hour
    const oldSessions = await sessionCollection.find({ 
      expires: { $lt: new Date() } 
    }).toArray();
    
    const oldSessionIds = oldSessions.map(session => session._id);
    
    // Find sessions that have no associated keys
    const keysWithSessions = await this.find({
      sessionId: { $in: oldSessionIds }
    }).distinct('sessionId');
    
    const unusedSessionIds = oldSessionIds.filter(sessionId => 
      !keysWithSessions.includes(sessionId)
    );
    
    // Delete unused sessions
    if (unusedSessionIds.length > 0) {
      await sessionCollection.deleteMany({ 
        _id: { $in: unusedSessionIds } 
      });
    }
    
    // Also delete very old sessions (older than 1 hour without key)
    const veryOldSessions = await sessionCollection.find({
      createdAt: { $lt: oneHourAgo }
    }).toArray();
    
    const veryOldSessionIds = veryOldSessions
      .map(session => session._id)
      .filter(sessionId => !keysWithSessions.includes(sessionId));
    
    if (veryOldSessionIds.length > 0) {
      await sessionCollection.deleteMany({
        _id: { $in: veryOldSessionIds }
      });
    }
    
    const totalDeleted = unusedSessionIds.length + veryOldSessionIds.length;
    console.log(`Cleaned up ${totalDeleted} unused sessions`);
    return { deletedSessions: totalDeleted };
  } catch (error) {
    console.error('Error cleaning up unused sessions:', error);
    throw error;
  }
};

// Index for faster queries
keySchema.index({ sessionId: 1, expiresAt: 1 });
keySchema.index({ fingerprint: 1, expiresAt: 1 });
keySchema.index({ ipAddress: 1, expiresAt: 1 });
keySchema.index({ lastAccessed: 1 });

module.exports = mongoose.model('Key', keySchema);