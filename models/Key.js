const mongoose = require('mongoose');

const keySchema = new mongoose.Schema({
    keyValue: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    sessionId: {
        type: String,
        required: true
    },
    ipAddress: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'revoked'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 } // MongoDB TTL index for auto cleanup
    },
    lastAccessed: {
        type: Date,
        default: Date.now
    },
    accessCount: {
        type: Number,
        default: 0
    }
});

// Generate random key
keySchema.statics.generateKey = function() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Check if key is expired
keySchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

// Update last accessed time
keySchema.methods.updateAccess = function() {
    this.lastAccessed = new Date();
    this.accessCount += 1;
    return this.save();
};

// Get time remaining in milliseconds
keySchema.methods.getTimeRemaining = function() {
    const now = new Date();
    const remaining = this.expiresAt.getTime() - now.getTime();
    return remaining > 0 ? remaining : 0;
};

// Virtual for formatted time remaining
keySchema.virtual('timeRemainingFormatted').get(function() {
    const remaining = this.getTimeRemaining();
    if (remaining <= 0) return 'Expired';
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
});

// Ensure virtual fields are serialized
keySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Key', keySchema);