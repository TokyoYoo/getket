const express = require('express');
const router = express.Router();
const Key = require('../models/Key');

// API for Lua script to validate keys
router.post('/validate', async (req, res) => {
    try {
        const { key, hwid, username } = req.body;
        
        // Basic validation
        if (!key) {
            return res.json({
                success: false,
                message: 'Key is required',
                valid: false
            });
        }

        // Find and validate key in database
        const keyRecord = await Key.findValidKey(key);
        
        if (!keyRecord) {
            return res.json({
                success: false,
                message: 'Invalid or expired key',
                valid: false
            });
        }

        // Update usage statistics
        await keyRecord.markAsUsed();

        // Calculate time remaining
        const timeRemaining = Math.max(0, keyRecord.expiresAt - new Date());
        const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

        res.json({
            success: true,
            message: 'Key is valid',
            valid: true,
            keyInfo: {
                key: keyRecord.keyValue,
                expiresAt: keyRecord.expiresAt,
                timeRemaining: timeRemaining,
                hoursRemaining: hoursRemaining,
                minutesRemaining: minutesRemaining,
                usageCount: keyRecord.usageCount,
                status: keyRecord.status
            }
        });

    } catch (error) {
        console.error('API validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            valid: false
        });
    }
});

// Quick key check endpoint (for simple validation)
router.get('/check/:key', async (req, res) => {
    try {
        const { key } = req.params;
        
        if (!key) {
            return res.json({ valid: false, message: 'No key provided' });
        }

        const keyRecord = await Key.findValidKey(key);
        
        if (!keyRecord) {
            return res.json({ valid: false, message: 'Invalid or expired key' });
        }

        // Update last used without increasing usage count for this endpoint
        keyRecord.lastUsed = new Date();
        await keyRecord.save();

        const timeRemaining = Math.max(0, keyRecord.expiresAt - new Date());

        res.json({
            valid: true,
            message: 'Key is valid',
            expiresAt: keyRecord.expiresAt,
            timeRemaining: timeRemaining
        });

    } catch (error) {
        console.error('API check error:', error);
        res.status(500).json({
            valid: false,
            message: 'Server error'
        });
    }
});

// Batch key validation (for multiple keys at once)
router.post('/validate-batch', async (req, res) => {
    try {
        const { keys } = req.body;
        
        if (!Array.isArray(keys) || keys.length === 0) {
            return res.json({
                success: false,
                message: 'Keys array is required',
                results: []
            });
        }

        // Limit batch size to prevent abuse
        const limitedKeys = keys.slice(0, 10);
        
        const validationPromises = limitedKeys.map(async (key) => {
            try {
                const keyRecord = await Key.findValidKey(key);
                
                if (!keyRecord) {
                    return {
                        key: key,
                        valid: false,
                        message: 'Invalid or expired key'
                    };
                }

                await keyRecord.markAsUsed();
                const timeRemaining = Math.max(0, keyRecord.expiresAt - new Date());

                return {
                    key: key,
                    valid: true,
                    message: 'Key is valid',
                    expiresAt: keyRecord.expiresAt,
                    timeRemaining: timeRemaining
                };
            } catch (error) {
                return {
                    key: key,
                    valid: false,
                    message: 'Validation error'
                };
            }
        });

        const results = await Promise.all(validationPromises);

        res.json({
            success: true,
            message: 'Batch validation completed',
            results: results,
            validCount: results.filter(r => r.valid).length,
            invalidCount: results.filter(r => !r.valid).length
        });

    } catch (error) {
        console.error('Batch validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Batch validation failed',
            results: []
        });
    }
});

// Get key information (detailed)
router.get('/info/:key', async (req, res) => {
    try {
        const { key } = req.params;
        
        const keyRecord = await Key.findOne({ keyValue: key }).lean();
        
        if (!keyRecord) {
            return res.json({
                success: false,
                message: 'Key not found',
                found: false
            });
        }

        const isValid = keyRecord.status === 'ACTIVE' && keyRecord.expiresAt > new Date();
        const timeRemaining = Math.max(0, keyRecord.expiresAt - new Date());

        res.json({
            success: true,
            message: 'Key information retrieved',
            found: true,
            keyInfo: {
                key: keyRecord.keyValue,
                status: keyRecord.status,
                isValid: isValid,
                createdAt: keyRecord.createdAt,
                expiresAt: keyRecord.expiresAt,
                timeRemaining: timeRemaining,
                usageCount: keyRecord.usageCount,
                lastUsed: keyRecord.lastUsed,
                ipAddress: keyRecord.ipAddress.substring(0, 3) + '***' // Partial IP for privacy
            }
        });

    } catch (error) {
        console.error('Key info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get key information',
            found: false
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'API is running',
        timestamp: new Date(),
        uptime: process.uptime()
    });
});

// Rate limiting middleware for API endpoints
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

const rateLimitMiddleware = (req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimit[clientIp]) {
        rateLimit[clientIp] = {
            requests: 1,
            resetTime: now + RATE_LIMIT_WINDOW
        };
        return next();
    }
    
    if (now > rateLimit[clientIp].resetTime) {
        rateLimit[clientIp] = {
            requests: 1,
            resetTime: now + RATE_LIMIT_WINDOW
        };
        return next();
    }
    
    if (rateLimit[clientIp].requests >= RATE_LIMIT_MAX_REQUESTS) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil((rateLimit[clientIp].resetTime - now) / 1000)
        });
    }
    
    rateLimit[clientIp].requests++;
    next();
};

// Apply rate limiting to all API routes
router.use(rateLimitMiddleware);

module.exports = router;