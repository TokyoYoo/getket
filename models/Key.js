// models/Key.js - Key model for database
const mongoose = require('mongoose');

const keySchema = new mongoose.Schema({
    keyId: {
        type: String,
        required: true,
        unique: true
    },
    token: {
        type: String,
        required: true,
        unique: true
    },
    ip: {
        type: String,
        required: true
    },
    userAgent: {
        type: String,
        default: ''
    },
    step: {
        type: Number,
        default: 0, // 0: not started, 1: checkpoint 1, 2: checkpoint 2, 3: checkpoint 3, 4: completed
        min: 0,
        max: 4
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    checkpoints: {
        checkpoint1: {
            type: Boolean,
            default: false
        },
        checkpoint2: {
            type: Boolean,
            default: false
        },
        checkpoint3: {
            type: Boolean,
            default: false
        }
    },
    lastAccessed: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for automatic expiration
keySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for faster queries
keySchema.index({ token: 1 });
keySchema.index({ keyId: 1 });
keySchema.index({ ip: 1 });

// Methods
keySchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

keySchema.methods.updateLastAccessed = function() {
    this.lastAccessed = new Date();
    return this.save();
};

keySchema.methods.completeCheckpoint = function(checkpointNumber) {
    switch(checkpointNumber) {
        case 1:
            this.checkpoints.checkpoint1 = true;
            this.step = Math.max(this.step, 1);
            break;
        case 2:
            this.checkpoints.checkpoint2 = true;
            this.step = Math.max(this.step, 2);
            break;
        case 3:
            this.checkpoints.checkpoint3 = true;
            this.step = Math.max(this.step, 3);
            break;
    }
    
    // Check if all checkpoints are completed
    if (this.checkpoints.checkpoint1 && 
        this.checkpoints.checkpoint2 && 
        this.checkpoints.checkpoint3) {
        this.step = 4; // Completed
    }
    
    return this.save();
};

keySchema.methods.canAccessCheckpoint = function(checkpointNumber) {
    switch(checkpointNumber) {
        case 1:
            return true; // Everyone can access checkpoint 1
        case 2:
            return this.checkpoints.checkpoint1;
        case 3:
            return this.checkpoints.checkpoint1 && this.checkpoints.checkpoint2;
        default:
            return false;
    }
};

keySchema.methods.canAccessKey = function() {
    return this.checkpoints.checkpoint1 && 
           this.checkpoints.checkpoint2 && 
           this.checkpoints.checkpoint3 && 
           !this.isExpired();
};

module.exports = mongoose.model('Key', keySchema);