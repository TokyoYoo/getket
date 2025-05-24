const express = require('express');
const router = express.Router();
const Key = require('../models/Key');
const crypto = require('crypto');

// Function to generate browser fingerprint
function generateFingerprint(req) {
  const userAgent = req.get('User-Agent') || '';
  const acceptLanguage = req.get('Accept-Language') || '';
  const acceptEncoding = req.get('Accept-Encoding') || '';
  const ip = req.ip || req.connection.remoteAddress || '';
  
  // Create a unique fingerprint based on browser characteristics
  const fingerprintData = `${userAgent}|${acceptLanguage}|${acceptEncoding}|${ip}`;
  return crypto.createHash('sha256').update(fingerprintData).digest('hex');
}

// Function to clean session data
async function cleanSessionData(sessionId) {
  try {
    const mongoose = require('mongoose');
    const sessionCollection = mongoose.connection.db.collection('sessions');
    await sessionCollection.deleteOne({ _id: sessionId });
    console.log(`Cleaned session: ${sessionId}`);
  } catch (error) {
    console.error('Error cleaning session:', error);
  }
}

// Access page - Generate or display key
router.get('/', async (req, res) => {
  try {
    // Check if user has completed all checkpoints
    if (!req.session.passed1 || !req.session.passed2 || !req.session.passed3) {
      return res.redirect('/checkpoint/1');
    }
    
    const sessionId = req.sessionID;
    const fingerprint = generateFingerprint(req);
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    
    // Check if user already has a valid key with same fingerprint
    let existingKey = await Key.findOne({
      $or: [
        { sessionId: sessionId, fingerprint: fingerprint },
        { fingerprint: fingerprint }
      ],
      expiresAt: { $gt: new Date() }
    });
    
    if (existingKey) {
      // Update last accessed time
      await existingKey.updateLastAccessed();
      
      // Update session ID if different (browser change scenario)
      if (existingKey.sessionId !== sessionId) {
        existingKey.sessionId = sessionId;
        await existingKey.save();
      }
      
      // User has valid key, display it
      return res.render('access', {
        title: 'Your Access Key',
        key: existingKey.key,
        expiresAt: existingKey.expiresAt,
        remainingTime: existingKey.getRemainingTime(),
        isNew: false
      });
    }
    
    // Clean up expired keys and sessions for this fingerprint/session
    const expiredKeys = await Key.find({
      $or: [
        { sessionId: sessionId },
        { fingerprint: fingerprint }
      ],
      expiresAt: { $lte: new Date() }
    });
    
    // Clean sessions for expired keys
    for (const expiredKey of expiredKeys) {
      await cleanSessionData(expiredKey.sessionId);
    }
    
    // Remove expired keys
    await Key.deleteMany({
      $or: [
        { sessionId: sessionId },
        { fingerprint: fingerprint }
      ],
      expiresAt: { $lte: new Date() }
    });
    
    // Generate new key
    const keyString = await Key.generateUniqueKey();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    const newKey = new Key({
      key: keyString,
      sessionId: sessionId,
      fingerprint: fingerprint,
      ipAddress: ipAddress,
      userAgent: userAgent,
      expiresAt: expiresAt
    });
    
    await newKey.save();
    
    res.render('access', {
      title: 'Your New Access Key',
      key: newKey.key,
      expiresAt: newKey.expiresAt,
      remainingTime: newKey.getRemainingTime(),
      isNew: true
    });
    
  } catch (error) {
    console.error('Error in access route:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'An error occurred while generating your key. Please try again.'
    });
  }
});

// API endpoint to check key status
router.get('/status/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const keyDoc = await Key.findOne({ key: key });
    
    if (!keyDoc) {
      return res.json({ exists: false });
    }
    
    const isExpired = keyDoc.isExpired();
    
    if (isExpired) {
      // Clean session data when key expires
      await cleanSessionData(keyDoc.sessionId);
      await Key.deleteOne({ _id: keyDoc._id });
      return res.json({ exists: false, expired: true });
    }
    
    // Update last accessed time
    await keyDoc.updateLastAccessed();
    
    res.json({
      exists: true,
      expired: false,
      expiresAt: keyDoc.expiresAt,
      remainingTime: keyDoc.getRemainingTime(),
      createdAt: keyDoc.createdAt,
      lastAccessed: keyDoc.lastAccessed
    });
    
  } catch (error) {
    console.error('Error checking key status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API endpoint to refresh key (extend expiration)
router.post('/refresh/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const fingerprint = generateFingerprint(req);
    
    const keyDoc = await Key.findOne({ 
      key: key,
      fingerprint: fingerprint
    });
    
    if (!keyDoc) {
      return res.status(404).json({ error: 'Key not found or fingerprint mismatch' });
    }
    
    if (keyDoc.isExpired()) {
      await cleanSessionData(keyDoc.sessionId);
      await Key.deleteOne({ _id: keyDoc._id });
      return res.status(410).json({ error: 'Key expired' });
    }
    
    // Extend expiration by 24 hours
    keyDoc.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    keyDoc.lastAccessed = new Date();
    await keyDoc.save();
    
    res.json({
      success: true,
      message: 'Key refreshed successfully',
      expiresAt: keyDoc.expiresAt,
      remainingTime: keyDoc.getRemainingTime()
    });
    
  } catch (error) {
    console.error('Error refreshing key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;