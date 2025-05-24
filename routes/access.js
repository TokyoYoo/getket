const express = require('express');
const router = express.Router();
const Key = require('../models/Key');
const sessionCheck = require('../middleware/sessionCheck');

// Initialize session for all access routes
router.use(sessionCheck.initializeSession);

// Access page - Checkpoint 3 (Key generation/display)
router.get('/', sessionCheck.canAccessCheckpoint(3), async (req, res) => {
    try {
        // Check if user already has an active key for this session
        const existingKey = await Key.findOne({
            sessionId: req.sessionID,
            status: 'active'
        });

        if (existingKey && !existingKey.isExpired()) {
            // User already has a valid key
            return res.render('access', {
                title: 'Access Key',
                hasKey: true,
                key: existingKey,
                timeRemaining: existingKey.timeRemainingFormatted,
                session: req.session.checkpoint
            });
        } else if (existingKey && existingKey.isExpired()) {
            // Key exists but expired, update status
            existingKey.status = 'expired';
            await existingKey.save();
        }

        // Generate new key
        const keyValue = Key.generateKey();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + (process.env.KEY_EXPIRY_HOURS || 24));

        const newKey = new Key({
            keyValue: keyValue,
            sessionId: req.sessionID,
            ipAddress: req.ip || req.connection.remoteAddress,
            expiresAt: expiresAt
        });

        await newKey.save();

        res.render('access', {
            title: 'Access Key Generated',
            hasKey: true,
            key: newKey,
            timeRemaining: newKey.timeRemainingFormatted,
            session: req.session.checkpoint,
            isNewKey: true
        });

    } catch (error) {
        console.error('Error generating access key:', error);
        res.render('access', {
            title: 'Access Key Error',
            hasKey: false,
            error: 'Failed to generate access key. Please try again.',
            session: req.session.checkpoint
        });
    }
});

// Generate new key (force regeneration)
router.post('/generate', sessionCheck.canAccessCheckpoint(3), async (req, res) => {
    try {
        // Revoke existing active keys for this session
        await Key.updateMany(
            { sessionId: req.sessionID, status: 'active' },
            { status: 'revoked' }
        );

        // Generate new key
        const keyValue = Key.generateKey();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + (process.env.KEY_EXPIRY_HOURS || 24));

        const newKey = new Key({
            keyValue: keyValue,
            sessionId: req.sessionID,
            ipAddress: req.ip || req.connection.remoteAddress,
            expiresAt: expiresAt
        });

        await newKey.save();

        res.json({
            success: true,
            key: newKey.keyValue,
            expiresAt: newKey.expiresAt,
            timeRemaining: newKey.timeRemainingFormatted
        });

    } catch (error) {
        console.error('Error generating new key:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate new key'
        });
    }
});

// Check key status
router.get('/status', async (req, res) => {
    try {
        const key = await Key.findOne({
            sessionId: req.sessionID,
            status: 'active'
        });

        if (!key) {
            return res.json({
                hasKey: false,
                message: 'No active key found'
            });
        }

        if (key.isExpired()) {
            key.status = 'expired';
            await key.save();
            
            return res.json({
                hasKey: false,
                message: 'Key has expired'
            });
        }

        res.json({
            hasKey: true,
            key: key.keyValue,
            expiresAt: key.expiresAt,
            timeRemaining: key.timeRemainingFormatted,
            accessCount: key.accessCount,
            lastAccessed: key.lastAccessed
        });

    } catch (error) {
        console.error('Error checking key status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check key status'
        });
    }
});

// Extend key expiration (optional feature)
router.post('/extend', async (req, res) => {
    try {
        const key = await Key.findOne({
            sessionId: req.sessionID,
            status: 'active'
        });

        if (!key || key.isExpired()) {
            return res.status(404).json({
                success: false,
                error: 'No active key found or key expired'
            });
        }

        // Extend by additional hours
        const additionalHours = parseInt(req.body.hours) || 24;
        key.expiresAt = new Date(key.expiresAt.getTime() + (additionalHours * 60 * 60 * 1000));
        await key.save();

        res.json({
            success: true,
            message: `Key extended by ${additionalHours} hours`,
            newExpiresAt: key.expiresAt,
            timeRemaining: key.timeRemainingFormatted
        });

    } catch (error) {
        console.error('Error extending key:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to extend key'
        });
    }
});

module.exports = router;