const express = require('express');
const router = express.Router();
const Key = require('../models/Key');

// Middleware to handle API authentication and rate limiting
const apiMiddleware = {
    // Basic rate limiting
    rateLimit: (req, res, next) => {
        // Simple in-memory rate limiting (use Redis in production)
        const ip = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const windowMs = 60 * 1000; // 1 minute
        const maxRequests = 60; // 60 requests per minute

        if (!req.app.locals.rateLimiter) {
            req.app.locals.rateLimiter = new Map();
        }

        const key = `api_${ip}`;
        const requests = req.app.locals.rateLimiter.get(key) || [];
        
        // Clean old requests
        const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
        
        if (validRequests.length >= maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'Rate limit exceeded',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }

        validRequests.push(now);
        req.app.locals.rateLimiter.set(key, validRequests);
        next();
    },

    // Log API requests
    logRequest: (req, res, next) => {
        console.log(`API Request: ${req.method} ${req.path} from ${req.ip}`);
        next();
    }
};

// Apply middleware to all API routes
router.use(apiMiddleware.rateLimit);
router.use(apiMiddleware.logRequest);

// Verify key endpoint - Main endpoint for Lua script
router.post('/verify-key', async (req, res) => {
    try {
        const { key, hwid } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;

        // Validate input
        if (!key) {
            return res.status(400).json({
                success: false,
                error: 'Key is required',
                code: 'MISSING_KEY'
            });
        }

        // Find the key in database
        const keyDoc = await Key.findOne({ keyValue: key });

        if (!keyDoc) {
            return res.status(404).json({
                success: false,
                error: 'Invalid key',
                code: 'INVALID_KEY'
            });
        }

        // Check if key is expired
        if (keyDoc.isExpired()) {
            // Update status to expired
            keyDoc.status = 'expired';
            await keyDoc.save();
            
            return res.status(401).json({
                success: false,
                error: 'Key has expired',
                code: 'KEY_EXPIRED',
                expiredAt: keyDoc.expiresAt
            });
        }

        // Check if key is revoked
        if (keyDoc.status === 'revoked') {
            return res.status(403).json({
                success: false,
                error: 'Key has been revoked',
                code: 'KEY_REVOKED'
            });
        }

        // Check if key is active
        if (keyDoc.status !== 'active') {
            return res.status(403).json({
                success: false,
                error: 'Key is not active',
                code: 'KEY_INACTIVE',
                status: keyDoc.status
            });
        }

        // Update access information
        await keyDoc.updateAccess();

        // Successful verification
        res.json({
            success: true,
            message: 'Key verified successfully',
            data: {
                keyValue: keyDoc.keyValue,
                expiresAt: keyDoc.expiresAt,
                timeRemaining: keyDoc.getTimeRemaining(),
                timeRemainingFormatted: keyDoc.timeRemainingFormatted,
                accessCount: keyDoc.accessCount,
                lastAccessed: keyDoc.lastAccessed,
                status: keyDoc.status
            }
        });

    } catch (error) {
        console.error('Key verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'SERVER_ERROR'
        });
    }
});

// Get key information endpoint
router.get('/key-info/:keyValue', async (req, res) => {
    try {
        const { keyValue } = req.params;

        if (!keyValue) {
            return res.status(400).json({
                success: false,
                error: 'Key value is required'
            });
        }

        const keyDoc = await Key.findOne({ keyValue: keyValue });

        if (!keyDoc) {
            return res.status(404).json({
                success: false,
                error: 'Key not found'
            });
        }

        // Return public information only
        res.json({
            success: true,
            data: {
                status: keyDoc.status,
                createdAt: keyDoc.createdAt,
                expiresAt: keyDoc.expiresAt,
                timeRemaining: keyDoc.getTimeRemaining(),
                timeRemainingFormatted: keyDoc.timeRemainingFormatted,
                isExpired: keyDoc.isExpired(),
                accessCount: keyDoc.accessCount,
                lastAccessed: keyDoc.lastAccessed
            }
        });

    } catch (error) {
        console.error('Key info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get key information'
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'API is healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Get server time (useful for client synchronization)
router.get('/time', (req, res) => {
    res.json({
        success: true,
        serverTime: new Date().toISOString(),
        timestamp: Date.now()
    });
});

// Validate session endpoint (for web interface)
router.get('/validate-session', (req, res) => {
    const sessionData = req.session.checkpoint;
    
    if (!sessionData) {
        return res.json({
            success: false,
            hasSession: false,
            message: 'No session found'
        });
    }

    res.json({
        success: true,
        hasSession: true,
        data: {
            current: sessionData.current,
            completed: sessionData.completed,
            startTime: sessionData.startTime,
            canAccess: {
                checkpoint1: true,
                checkpoint2: sessionData.completed.includes(1),
                access: sessionData.completed.includes(1) && sessionData.completed.includes(2)
            }
        }
    });
});

// Batch key verification (for multiple keys)
router.post('/verify-keys', async (req, res) => {
    try {
        const { keys } = req.body;

        if (!keys || !Array.isArray(keys)) {
            return res.status(400).json({
                success: false,
                error: 'Keys array is required'
            });
        }

        if (keys.length > 10) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 10 keys per batch request'
            });
        }

        const results = [];

        for (const key of keys) {
            try {
                const keyDoc = await Key.findOne({ keyValue: key });
                
                if (!keyDoc) {
                    results.push({
                        key: key,
                        success: false,
                        error: 'Invalid key',
                        code: 'INVALID_KEY'
                    });
                    continue;
                }

                if (keyDoc.isExpired()) {
                    keyDoc.status = 'expired';
                    await keyDoc.save();
                    
                    results.push({
                        key: key,
                        success: false,
                        error: 'Key expired',
                        code: 'KEY_EXPIRED'
                    });
                    continue;
                }

                if (keyDoc.status !== 'active') {
                    results.push({
                        key: key,
                        success: false,
                        error: 'Key not active',
                        code: 'KEY_INACTIVE'
                    });
                    continue;
                }

                await keyDoc.updateAccess();
                
                results.push({
                    key: key,
                    success: true,
                    timeRemaining: keyDoc.getTimeRemaining(),
                    expiresAt: keyDoc.expiresAt
                });

            } catch (error) {
                results.push({
                    key: key,
                    success: false,
                    error: 'Verification failed',
                    code: 'VERIFICATION_ERROR'
                });
            }
        }

        res.json({
            success: true,
            results: results
        });

    } catch (error) {
        console.error('Batch verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Batch verification failed'
        });
    }
});

module.exports = router;