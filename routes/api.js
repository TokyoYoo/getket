// routes/api.js - API routes for key validation and creation
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const Key = require('../models/Key');
const Config = require('../models/Config');

// Helper function to get client IP
function getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
}

// Rate limiting storage
const rateLimitStore = new Map();

// Rate limiting middleware
function rateLimit(req, res, next) {
    const ip = getClientIP(req);
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    
    if (!rateLimitStore.has(ip)) {
        rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
    }
    
    const record = rateLimitStore.get(ip);
    
    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + windowMs;
        return next();
    }
    
    if (record.count >= 100) { // 100 requests per hour
        return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            message: 'Too many requests. Please try again later.'
        });
    }
    
    record.count++;
    next();
}

// Validate key endpoint - Used by Lua scripts
router.get('/validate-key', rateLimit, async (req, res) => {
    try {
        const { key } = req.query;
        
        if (!key) {
            return res.status(400).json({
                success: false,
                error: 'Missing key parameter',
                message: 'Key parameter is required'
            });
        }
        
        const keyData = await Key.findOne({ keyId: key });
        
        if (!keyData) {
            return res.status(404).json({
                success: false,
                error: 'Invalid key',
                message: 'The provided key does not exist'
            });
        }
        
        if (keyData.isExpired()) {
            return res.status(410).json({
                success: false,
                error: 'Key expired',
                message: 'The provided key has expired',
                expiredAt: keyData.expiresAt
            });
        }
        
        if (!keyData.canAccessKey()) {
            return res.status(403).json({
                success: false,
                error: 'Key not activated',
                message: 'Complete all checkpoints to activate this key'
            });
        }
        
        // Update last accessed time
        await keyData.updateLastAccessed();
        
        res.json({
            success: true,
            message: 'Key is valid',
            data: {
                keyId: keyData.keyId,
                createdAt: keyData.createdAt,
                expiresAt: keyData.expiresAt,
                timeRemaining: Math.ceil((keyData.expiresAt - new Date()) / (1000 * 60)), // Minutes
                isActive: keyData.isActive
            }
        });
        
    } catch (error) {
        console.error('Error validating key:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Unable to validate key'
        });
    }
});

// Create new key endpoint
router.post('/create-key', rateLimit, async (req, res) => {
    try {
        const ip = getClientIP(req);
        const userAgent = req.headers['user-agent'] || '';
        const config = await Config.getSingle();
        
        // Check if user already has an active key
        const existingKey = await Key.findOne({
            ip: ip,
            expiresAt: { $gt: new Date() },
            isActive: true
        });
        
        if (existingKey && existingKey.canAccessKey()) {
            return res.json({
                success: true,
                message: 'Using existing active key',
                data: {
                    keyId: existingKey.keyId,
                    token: existingKey.token,
                    expiresAt: existingKey.expiresAt,
                    timeRemaining: Math.ceil((existingKey.expiresAt - new Date()) / (1000 * 60))
                }
            });
        }
        
        // Create new key
        const expirationTime = new Date();
        expirationTime.setHours(expirationTime.getHours() + config.keyExpirationHours);
        
        const newKey = new Key({
            keyId: uuidv4(),
            token: uuidv4(),
            ip: ip,
            userAgent: userAgent,
            step: 0,
            expiresAt: expirationTime
        });
        
        await newKey.save();
        
        res.json({
            success: true,
            message: 'New key created successfully',
            data: {
                keyId: newKey.keyId,
                token: newKey.token,
                expiresAt: newKey.expiresAt,
                timeRemaining: Math.ceil((newKey.expiresAt - new Date()) / (1000 * 60)),
                checkpointUrl: `/checkpoint/1?token=${newKey.token}`
            }
        });
        
    } catch (error) {
        console.error('Error creating key:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Unable to create key'
        });
    }
});

// Get key statistics endpoint
router.get('/stats', async (req, res) => {
    try {
        const totalKeys = await Key.countDocuments();
        const activeKeys = await Key.countDocuments({
            expiresAt: { $gt: new Date() },
            isActive: true
        });
        const completedKeys = await Key.countDocuments({
            step: 4,
            isActive: true
        });
        
        res.json({
            success: true,
            data: {
                totalKeys,
                activeKeys,
                completedKeys,
                expiredKeys: totalKeys - activeKeys
            }
        });
        
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Unable to get statistics'
        });
    }
});

module.exports = router;