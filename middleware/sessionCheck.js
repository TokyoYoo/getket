// Middleware to check session and checkpoint progress
const sessionCheck = {
    // Initialize session checkpoint data
    initSession: (req, res, next) => {
        if (!req.session.checkpoints) {
            req.session.checkpoints = {
                checkpoint1: false,
                checkpoint2: false,
                checkpoint3: false,
                currentCheckpoint: 1,
                startTime: new Date(),
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent') || ''
            };
        }
        next();
    },

    // Check if user can access specific checkpoint
    canAccessCheckpoint: (checkpointNumber) => {
        return (req, res, next) => {
            const checkpoints = req.session.checkpoints;
            
            if (!checkpoints) {
                return res.redirect('/checkpoint/1');
            }

            // Always allow access to checkpoint 1
            if (checkpointNumber === 1) {
                return next();
            }

            // For checkpoint 2, must have completed checkpoint 1
            if (checkpointNumber === 2) {
                if (!checkpoints.checkpoint1) {
                    return res.redirect('/checkpoint/1');
                }
                return next();
            }

            // For checkpoint 3 (access), must have completed checkpoint 1 and 2
            if (checkpointNumber === 3) {
                if (!checkpoints.checkpoint1 || !checkpoints.checkpoint2) {
                    return res.redirect('/checkpoint/' + (checkpoints.checkpoint1 ? '2' : '1'));
                }
                return next();
            }

            next();
        };
    },

    // Mark checkpoint as completed
    completeCheckpoint: (checkpointNumber) => {
        return (req, res, next) => {
            if (!req.session.checkpoints) {
                req.session.checkpoints = {
                    checkpoint1: false,
                    checkpoint2: false,
                    checkpoint3: false,
                    currentCheckpoint: 1,
                    startTime: new Date(),
                    ipAddress: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('User-Agent') || ''
                };
            }

            const checkpoints = req.session.checkpoints;
            
            switch(checkpointNumber) {
                case 1:
                    checkpoints.checkpoint1 = true;
                    checkpoints.currentCheckpoint = 2;
                    break;
                case 2:
                    checkpoints.checkpoint2 = true;
                    checkpoints.currentCheckpoint = 3;
                    break;
                case 3:
                    checkpoints.checkpoint3 = true;
                    break;
            }

            checkpoints.lastUpdated = new Date();
            
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).json({ error: 'Session save failed' });
                }
                next();
            });
        };
    },

    // Check if user has valid key
    hasValidKey: async (req, res, next) => {
        try {
            if (!req.session.userKey) {
                return res.redirect('/checkpoint/1');
            }

            const Key = require('../models/Key');
            const key = await Key.findValidKey(req.session.userKey);
            
            if (!key) {
                // Key expired or invalid, clear session and redirect
                req.session.destroy((err) => {
                    if (err) console.error('Session destroy error:', err);
                    res.redirect('/checkpoint/1');
                });
                return;
            }

            // Update last used time
            await key.markAsUsed();
            req.userKey = key;
            next();
        } catch (error) {
            console.error('Key validation error:', error);
            res.status(500).json({ error: 'Key validation failed' });
        }
    },

    // Get session progress info
    getProgress: (req, res, next) => {
        const checkpoints = req.session.checkpoints || {};
        req.sessionProgress = {
            checkpoint1: checkpoints.checkpoint1 || false,
            checkpoint2: checkpoints.checkpoint2 || false,
            checkpoint3: checkpoints.checkpoint3 || false,
            currentCheckpoint: checkpoints.currentCheckpoint || 1,
            startTime: checkpoints.startTime || new Date(),
            hasKey: !!req.session.userKey
        };
        next();
    }
};

module.exports = sessionCheck;