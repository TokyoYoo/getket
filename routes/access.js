const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Key = require('../models/Key');
const sessionCheck = require('../middleware/sessionCheck');

// Initialize session for all access routes
router.use(sessionCheck.initSession);
router.use(sessionCheck.getProgress);

// Access page - Generate and display key (Checkpoint 3)
router.get('/', sessionCheck.canAccessCheckpoint(3), async (req, res) => {
    try {
        // Check if user already has a valid key
        if (req.session.userKey) {
            const existingKey = await Key.findValidKey(req.session.userKey);
            if (existingKey) {
                return res.render('access', {
                    title: 'Your Access Key',
                    keyGenerated: true,
                    keyValue: existingKey.keyValue,
                    expiresAt: existingKey.expiresAt,
                    progress: req.sessionProgress,
                    error: null
                });
            }
        }

        // Generate new key if user doesn't have valid one
        const keyValue = uuidv4().replace(/-/g, '').toUpperCase().substring(0, 16);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const newKey = new Key({
            keyValue: keyValue,
            sessionId: req.sessionID,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent') || '',
            expiresAt: expiresAt
        });

        await newKey.save();

        // Store key in session
        req.session.userKey = keyValue;
        req.session.keyExpiresAt = expiresAt;

        // Mark checkpoint 3 as completed
        sessionCheck.completeCheckpoint(3)(req, res, () => {
            res.render('access', {
                title: 'Your Access Key Generated!',
                keyGenerated: true,
                keyValue: keyValue,
                expiresAt: expiresAt,
                progress: req.sessionProgress,
                error: null
            });
        });

    } catch (error) {
        console.error('Key generation error:', error);
        res.render('access', {
            title: 'Access Key - Error',
            keyGenerated: false,
            keyValue: null,
            expiresAt: null,
            progress: req.sessionProgress,
            error: 'Failed to generate key. Please try again.'
        });
    }
});

// Key verification page
router.get('/verify', async (req, res) => {
    try {
        const { key } = req.query;
        
        if (!key) {
            return res.json({
                success: false,
                message: 'No key provided'
            });
        }

        const keyRecord = await Key.findValidKey(key);
        
        if (!keyRecord) {
            return res.json({
                success: false,
                message: 'Invalid or expired key'
            });
        }

        await keyRecord.markAsUsed();

        res.json({
            success: true,
            message: 'Key is valid',
            expiresAt: keyRecord.expiresAt,
            timeRemaining: Math.max(0, keyRecord.expiresAt - new Date())
        });

    } catch (error) {
        console.error('Key verification error:', error);
        res.json({
            success: false,
            message: 'Verification failed'
        });
    }
});

// Regenerate key (force new key generation)
router.post('/regenerate', sessionCheck.canAccessCheckpoint(3), async (req, res) => {
    try {
        // Revoke old key if exists
        if (req.session.userKey) {
            await Key.updateOne(
                { keyValue: req.session.userKey },
                { status: 'REVOKED' }
            );
        }

        // Generate new key
        const keyValue = uuidv4().replace(/-/g, '').toUpperCase().substring(0, 16);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const newKey = new Key({
            keyValue: keyValue,
            sessionId: req.sessionID,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent') || '',
            expiresAt: expiresAt
        });

        await newKey.save();

        // Update session
        req.session.userKey = keyValue;
        req.session.keyExpiresAt = expiresAt;

        res.json({
            success: true,
            keyValue: keyValue,
            expiresAt: expiresAt,
            message: 'New key generated successfully'
        });

    } catch (error) {
        console.error('Key regeneration error:', error);
        res.json({
            success: false,
            message: 'Failed to regenerate key'
        });
    }
});

// Check current key status
router.get('/status', async (req, res) => {
    try {
        if (!req.session.userKey) {
            return res.json({
                success: false,
                hasKey: false,
                message: 'No key found in session'
            });
        }

        const keyRecord = await Key.findValidKey(req.session.userKey);
        
        if (!keyRecord) {
            // Clear invalid key from session
            delete req.session.userKey;
            delete req.session.keyExpiresAt;
            
            return res.json({
                success: false,
                hasKey: false,
                message: 'Key expired or invalid'
            });
        }

        const timeRemaining = Math.max(0, keyRecord.expiresAt - new Date());

        res.json({
            success: true,
            hasKey: true,
            keyValue: keyRecord.keyValue,
            expiresAt: keyRecord.expiresAt,
            timeRemaining: timeRemaining,
            usageCount: keyRecord.usageCount,
            lastUsed: keyRecord.lastUsed
        });

    } catch (error) {
        console.error('Key status check error:', error);
        res.json({
            success: false,
            message: 'Status check failed'
        });
    }
});

module.exports = router;