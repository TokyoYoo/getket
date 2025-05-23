// models/Config.js - Configuration model
const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
    keyExpirationHours: {
        type: Number,
        default: 24,
        min: 1,
        max: 168 // Max 1 week
    },
    linkvertiseId1: {
        type: Number,
        required: true,
        default: 572754
    },
    linkvertiseId2: {
        type: Number,
        required: true,
        default: 572754
    },
    linkvertiseId3: {
        type: Number,
        required: true,
        default: 572754
    },
    webhookUrl: {
        type: String,
        default: '',
        trim: true
    },
    webhookInterval: {
        type: Number,
        default: 60, // minutes
        min: 5,
        max: 1440 // Max 24 hours
    },
    isWebhookEnabled: {
        type: Boolean,
        default: false
    },
    systemMessage: {
        type: String,
        default: 'Complete all checkpoints to get your key!',
        maxlength: 500
    },
    maintenanceMode: {
        type: Boolean,
        default: false
    },
    allowedIpsPerKey: {
        type: Number,
        default: 1,
        min: 1,
        max: 5
    },
    rateLimitPerHour: {
        type: Number,
        default: 100,
        min: 10,
        max: 1000
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Ensure only one config document exists
configSchema.statics.getSingle = async function() {
    let config = await this.findOne();
    if (!config) {
        config = await this.create({});
    }
    return config;
};

configSchema.methods.updateSettings = function(newSettings) {
    Object.assign(this, newSettings);
    this.updatedAt = new Date();
    return this.save();
};

module.exports = mongoose.model('Config', configSchema);