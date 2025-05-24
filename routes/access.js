const express = require('express');
const router = express.Router();
const Key = require('../models/Key');

// Access page - Generate or display key
router.get('/', async (req, res) => {
  try {
    // Check if user has completed all checkpoints
    if (!req.session.passed1 || !req.session.passed2 || !req.session.passed3) {
      return res.redirect('/checkpoint/1');
    }
    
    const sessionId = req.sessionID;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    
    // Check if user already has a valid key
    let existingKey = await Key.findOne({
      sessionId: sessionId,
      expiresAt: { $gt: new Date() }
    });
    
    if (existingKey) {
      // User has valid key, display it
      return res.render('access', {
        title: 'Your Access Key',
        key: existingKey.key,
        expiresAt: existingKey.expiresAt,
        remainingTime: existingKey.getRemainingTime(),
        isNew: false
      });
    }
    
    // Remove any expired keys for this session
    await Key.deleteMany({
      sessionId: sessionId,
      expiresAt: { $lte: new Date() }
    });
    
    // Generate new key
    const keyString = await Key.generateUniqueKey();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    const newKey = new Key({
      key: keyString,
      sessionId: sessionId,
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
      await Key.deleteOne({ _id: keyDoc._id });
      return res.json({ exists: false, expired: true });
    }
    
    res.json({
      exists: true,
      expired: false,
      expiresAt: keyDoc.expiresAt,
      remainingTime: keyDoc.getRemainingTime(),
      createdAt: keyDoc.createdAt
    });
    
  } catch (error) {
    console.error('Error checking key status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;