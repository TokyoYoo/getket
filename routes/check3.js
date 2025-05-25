const express = require('express');
const { getDB } = require('../db/connection');
const { getBrowserFingerprint } = require('../utils/generateKey');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const sessionId = req.query.session;
        const clientIP = req.ip || req.connection.remoteAddress;
        const fingerprint = getBrowserFingerprint(req);
        
        if (!sessionId) {
            return res.redirect('/getkey');
        }
        
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        // Find session and verify phase1 and phase2 are completed
        const session = await sessionsCollection.findOne({ sessionId });
        
        if (session && session.phase1 && session.phase2) {
            // Update phase3 to true
            await sessionsCollection.updateOne(
                { sessionId },
                { 
                    $set: { 
                        phase3: true,
                        lastActivity: new Date(),
                        ip: clientIP,
                        fingerprint: fingerprint
                    }
                }
            );
        }
        
        // Redirect back to main page
        res.redirect(`/getkey?session=${sessionId}`);
        
    } catch (error) {
        console.error('Check3 error:', error);
        res.redirect('/getkey');
    }
});

module.exports = router;