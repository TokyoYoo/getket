// routes/checkpoint.js - Checkpoint and access routes
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

// Helper function to get or create session token
async function getOrCreateToken(req, res) {
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    
    // Check if token exists in session
    if (req.session.token) {
        const existingKey = await Key.findOne({ 
            token: req.session.token,
            ip: ip 
        });
        
        if (existingKey && !existingKey.isExpired()) {
            return existingKey;
        } else {
            // Token expired or invalid, create new one
            req.session.token = null;
        }
    }
    
    // Create new token and key record
    const token = uuidv4();
    const config = await Config.getSingle();
    const expirationTime = new Date();
    expirationTime.setHours(expirationTime.getHours() + config.keyExpirationHours);
    
    const newKey = new Key({
        keyId: uuidv4(),
        token: token,
        ip: ip,
        userAgent: userAgent,
        step: 0,
        expiresAt: expirationTime
    });
    
    await newKey.save();
    req.session.token = token;
    
    return newKey;
}

// Checkpoint 1 route
router.get('/checkpoint/1', async (req, res) => {
    try {
        const config = await Config.getSingle();
        const keyData = await getOrCreateToken(req, res);
        
        // Mark checkpoint 1 as accessible
        if (keyData.step < 1) {
            keyData.step = 1;
            await keyData.save();
        }
        
        const nextUrl = `/checkpoint/2?token=${keyData.token}`;
        
        res.render('checkpoint', {
            title: 'Checkpoint 1',
            checkpointNumber: 1,
            linkvertiseId: config.linkvertiseId1,
            nextUrl: nextUrl,
            token: keyData.token,
            message: 'Complete the first checkpoint to continue'
        });
    } catch (error) {
        console.error('Error in checkpoint 1:', error);
        res.status(500).render('error', { 
            error: 'Internal Server Error',
            message: 'Unable to load checkpoint 1' 
        });
    }
});

// Checkpoint 2 route
router.get('/checkpoint/2', async (req, res) => {
    try {
        const token = req.query.token || req.session.token;
        
        if (!token) {
            return res.redirect('/checkpoint/1');
        }
        
        const keyData = await Key.findOne({ 
            token: token,
            ip: getClientIP(req)
        });
        
        if (!keyData || keyData.isExpired()) {
            req.session.token = null;
            return res.redirect('/checkpoint/1');
        }
        
        // Check if user can access checkpoint 2
        if (!keyData.canAccessCheckpoint(2)) {
            return res.redirect('/checkpoint/1');
        }
        
        // Mark checkpoint 1 as completed and allow checkpoint 2
        await keyData.completeCheckpoint(1);
        
        const config = await Config.getSingle();
        const nextUrl = `/checkpoint/3?token=${keyData.token}`;
        
        res.render('checkpoint', {
            title: 'Checkpoint 2',
            checkpointNumber: 2,
            linkvertiseId: config.linkvertiseId2,
            nextUrl: nextUrl,
            token: keyData.token,
            message: 'Complete the second checkpoint to continue'
        });
    } catch (error) {
        console.error('Error in checkpoint 2:', error);
        res.status(500).render('error', { 
            error: 'Internal Server Error',
            message: 'Unable to load checkpoint 2' 
        });
    }
});

// Checkpoint 3 route
router.get('/checkpoint/3', async (req, res) => {
    try {
        const token = req.query.token || req.session.token;
        
        if (!token) {
            return res.redirect('/checkpoint/1');
        }
        
        const keyData = await Key.findOne({ 
            token: token,
            ip: getClientIP(req)
        });
        
        if (!keyData || keyData.isExpired()) {
            req.session.token = null;
            return res.redirect('/checkpoint/1');
        }
        
        // Check if user can access checkpoint 3
        if (!keyData.canAccessCheckpoint(3)) {
            return res.redirect('/checkpoint/1');
        }
        
        // Mark checkpoint 2 as completed and allow checkpoint 3
        await keyData.completeCheckpoint(2);
        
        const config = await Config.getSingle();
        const nextUrl = `/access?token=${keyData.token}`;
        
        res.render('checkpoint', {
            title: 'Checkpoint 3',
            checkpointNumber: 3,
            linkvertiseId: config.linkvertiseId3,
            nextUrl: nextUrl,
            token: keyData.token,
            message: 'Complete the final checkpoint to get your key'
        });
    } catch (error) {
        console.error('Error in checkpoint 3:', error);
        res.status(500).render('error', { 
            error: 'Internal Server Error',
            message: 'Unable to load checkpoint 3' 
        });
    }
});

// Access route - Get the key
router.get('/access', async (req, res) => {
    try {
        const token = req.query.token || req.session.token;
        
        if (!token) {
            return res.redirect('/checkpoint/1');
        }
        
        const keyData = await Key.findOne({ 
            token: token,
            ip: getClientIP(req)
        });
        
        if (!keyData || keyData.isExpired()) {
            req.session.token = null;
            return res.redirect('/checkpoint/1');
        }
        
        // Check if user completed all checkpoints
        if (!keyData.canAccessKey()) {
            return res.redirect('/checkpoint/1');
        }
        
        // Complete final checkpoint
        await keyData.completeCheckpoint(3);
        await keyData.updateLastAccessed();
        
        const timeRemaining = Math.ceil((keyData.expiresAt - new Date()) / (1000 * 60 * 60)); // Hours
        
        res.render('access', {
            title: 'Your Key',
            key: keyData.keyId,
            expiresAt: keyData.expiresAt,
            timeRemaining: timeRemaining,
            token: keyData.token
        });
    } catch (error) {
        console.error('Error in access route:', error);
        res.status(500).render('error', { 
            error: 'Internal Server Error',
            message: 'Unable to access key' 
        });
    }
});

module.exports = router;