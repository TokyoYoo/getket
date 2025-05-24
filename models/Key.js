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

// Index for faster queries
keySchema.index({ sessionId: 1, expiresAt: 1 });
keySchema.index({ ipAddress: 1, expiresAt: 1 });

module.exports = mongoose.model('Key', keySchema);