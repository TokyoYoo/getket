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
    userAgent: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'EXPIRED', 'REVOKED'],
        default: 'ACTIVE'
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
    lastUsed: {
        type: Date,
        default: Date.now
    },
    usageCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for efficient queries
keySchema.index({ sessionId: 1, ipAddress: 1 });
keySchema.index({ status: 1, expiresAt: 1 });

// Method to check if key is valid
keySchema.methods.isValid = function() {
    return this.status === 'ACTIVE' && this.expiresAt > new Date();
};

// Method to mark key as used
keySchema.methods.markAsUsed = function() {
    this.lastUsed = new Date();
    this.usageCount += 1;
    return this.save();
};

// Static method to find valid key
keySchema.statics.findValidKey = function(keyValue) {
    return this.findOne({
        keyValue: keyValue,
        status: 'ACTIVE',
        expiresAt: { $gt: new Date() }
    });
};

// Static method to cleanup expired keys
keySchema.statics.cleanupExpired = function() {
    return this.updateMany(
        { expiresAt: { $lt: new Date() }, status: 'ACTIVE' },
        { status: 'EXPIRED' }
    );
};

module.exports = mongoose.model('Key', keySchema);