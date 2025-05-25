const express = require('express');
const { getDB } = require('../db/connection');
const { generateKey, getBrowserFingerprint } = require('../utils/generateKey');
const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        const fingerprint = getBrowserFingerprint(req);
        
        if (!sessionId) {
            return res.json({ success: false, message: 'Session ID required' });
        }
        
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        // Find session by sessionId OR by IP (to handle browser switching)
        let session = await sessionsCollection.findOne({ sessionId });
        
        if (!session) {
            // Try to find by IP if sessionId doesn't match
            session = await sessionsCollection.findOne({ 
                ip: clientIP,
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });
        }
        
        if (!session) {
            return res.json({ success: false, message: 'Session not found' });
        }
        
        if (!session.phase1 || !session.phase2 || !session.phase3) {
            return res.json({ success: false, message: 'All checkpoints must be completed first' });
        }
        
        // Check if key already exists
        if (session.key) {
            return res.json({ success: true, key: session.key });
        }
        
        // Generate new key
        const newKey = generateKey();
        const keyCreatedAt = new Date();
        const keyExpiresAt = new Date(keyCreatedAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        
        // Update session with key and sync fingerprint
        await sessionsCollection.updateOne(
            { sessionId: session.sessionId },
            { 
                $set: { 
                    key: newKey,
                    keyCreatedAt: keyCreatedAt,
                    keyExpiresAt: keyExpiresAt,
                    lastActivity: new Date(),
                    ip: clientIP,
                    fingerprint: fingerprint
                }
            }
        );
        
        res.json({ success: true, key: newKey });
        
    } catch (error) {
        console.error('Create key error:', error);
        res.json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;