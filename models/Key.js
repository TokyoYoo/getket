const mongoose = require('mongoose');

// Schema for storing keys and associated session data
const keySchema = new mongoose.Schema({
  // The generated key
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Session ID for linking to express-session
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  
  // User's IP address
  ipAddress: {
    type: String,
    required: true
  },
  
  // Device fingerprint for additional security
  deviceFingerprint: {
    type: String,
    required: true
  },
  
  // When the key expires (24 hours from creation)
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  
  // When the key was created
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // Checkpoint progress tracking
  checkpointProgress: {
    passed1: { type: Boolean, default: false },
    passed2: { type: Boolean, default: false },
    passed3: { type: Boolean, default: false }
  },
  
  // Key status
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked'],
    default: 'active'
  }
});

// Index for automatic expiration
keySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for checking if key is expired
keySchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Virtual for time remaining
keySchema.virtual('timeRemaining').get(function() {
  if (this.isExpired) return null;
  
  const now = new Date();
  const remaining = this.expiresAt - now;
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  
  return { hours, minutes, totalMs: remaining };
});

// Static method to find valid key
keySchema.statics.findValidKey = function(key, sessionId, deviceFingerprint) {
  return this.findOne({
    key: key,
    sessionId: sessionId,
    deviceFingerprint: deviceFingerprint,
    expiresAt: { $gt: new Date() },
    status: 'active'
  });
};

// Static method to cleanup expired keys
keySchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    $or: [
      { expiresAt: { $lt: new Date() } },
      { status: 'expired' }
    ]
  });
  
  console.log(`Cleaned up ${result.deletedCount} expired keys`);
  return result.deletedCount;
};

// Pre-save middleware to update status
keySchema.pre('save', function(next) {
  if (this.isExpired) {
    this.status = 'expired';
  }
  next();
});

// Method to generate a new key
keySchema.statics.generateNewKey = function() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

module.exports = mongoose.model('Key', keySchema);