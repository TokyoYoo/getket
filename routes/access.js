const express = require('express');
const router = express.Router();
const Key = require('../models/Key');
const { 
  initializeSession, 
  checkCheckpointAccess, 
  checkValidKey 
} = require('../middleware/sessionCheck');

// Apply middleware
router.use(initializeSession);
router.use(checkValidKey);

// Access page - generate or display key
router.get('/', checkCheckpointAccess('access'), async (req, res) => {
  try {
    let userKey = req.userKey;
    
    // If no valid key exists, create a new one
    if (!userKey) {
      const newKeyValue = Key.generateNewKey();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now
      
      userKey = new Key({
        key: newKeyValue,
        sessionId: req.sessionID,
        ipAddress: req.ip,
        deviceFingerprint: req.deviceFingerprint,
        expiresAt: expiresAt,
        checkpointProgress: {
          passed1: req.session.checkpoints.passed1,
          passed2: req.session.checkpoints.passed2,
          passed3: req.session.checkpoints.passed3
        }
      });
      
      await userKey.save();
      req.session.keyId = newKeyValue;
      
      console.log(`New key generated: ${newKeyValue} for session: ${req.sessionID}`);
    }
    
    // Check if key is expired
    if (userKey.isExpired) {
      // Clean up expired key
      await Key.deleteOne({ _id: userKey._id });
      delete req.session.keyId;
      delete req.session.checkpoints;
      
      return res.redirect('/checkpoint/1');
    }
    
    const timeRemaining = userKey.timeRemaining;
    
    res.render('access', {
      title: 'Access Key Generated',
      key: userKey.key,
      expiresAt: userKey.expiresAt,
      timeRemaining: timeRemaining,
      createdAt: userKey.createdAt
    });
    
  } catch (error) {
    console.error('Access route error:', error);
    
    if (error.code === 11000) {
      // Duplicate key error, try again
      return res.redirect('/access');
    }
    
    res.status(500).render('layout', {
      title: 'Error',
      body: `
        <div class="container">
          <div class="error-box">
            <h2>Something went wrong</h2>
            <p>Unable to generate access key. Please try again.</p>
            <a href="/checkpoint/1" class="btn">Start Over</a>
          </div>
        </div>
      `
    });
  }
});

// Refresh key endpoint
router.post('/refresh', checkCheckpointAccess('access'), async (req, res) => {
  try {
    // Delete existing key if any
    if (req.session.keyId) {
      await Key.deleteOne({ 
        sessionId: req.sessionID,
        deviceFingerprint: req.deviceFingerprint 
      });
    }
    
    // Clear session data to force regeneration
    delete req.session.keyId;
    
    res.redirect('/access');
    
  } catch (error) {
    console.error('Key refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh key' });
  }
});

module.exports = router;