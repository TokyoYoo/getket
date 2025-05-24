// Middleware to check checkpoint progression and session validity

const Key = require('../models/Key');

// Initialize session checkpoint data
const initializeSession = (req, res, next) => {
  if (!req.session.checkpoints) {
    req.session.checkpoints = {
      passed1: false,
      passed2: false,
      passed3: false
    };
  }
  
  // Verify device fingerprint consistency
  if (req.session.fingerprint && req.session.fingerprint !== req.deviceFingerprint) {
    console.log('Device fingerprint mismatch - resetting session');
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      res.redirect('/checkpoint/1');
    });
    return;
  }
  
  next();
};

// Check if user can access specific checkpoint
const checkCheckpointAccess = (requiredCheckpoint) => {
  return (req, res, next) => {
    if (!req.session.checkpoints) {
      return res.redirect('/checkpoint/1');
    }
    
    const { passed1, passed2, passed3 } = req.session.checkpoints;
    
    switch (requiredCheckpoint) {
      case 1:
        // Always allow access to checkpoint 1
        next();
        break;
        
      case 2:
        if (!passed1) {
          return res.redirect('/checkpoint/1');
        }
        next();
        break;
        
      case 3:
        if (!passed1 || !passed2) {
          return res.redirect('/checkpoint/1');
        }
        next();
        break;
        
      case 'access':
        if (!passed1 || !passed2 || !passed3) {
          return res.redirect('/checkpoint/1');
        }
        next();
        break;
        
      default:
        res.redirect('/checkpoint/1');
    }
  };
};

// Mark checkpoint as passed and update database if key exists
const markCheckpointPassed = async (req, checkpointNumber) => {
  req.session.checkpoints[`passed${checkpointNumber}`] = true;
  
  // Update database record if key exists
  if (req.session.keyId) {
    try {
      await Key.findOneAndUpdate(
        { 
          sessionId: req.sessionID,
          deviceFingerprint: req.deviceFingerprint 
        },
        { 
          [`checkpointProgress.passed${checkpointNumber}`]: true 
        }
      );
    } catch (error) {
      console.error('Error updating checkpoint progress:', error);
    }
  }
};

// Validate Linkvertise callback (this should be called when user returns from Linkvertise)
const validateLinkvertiseCallback = (checkpointNumber) => {
  return async (req, res, next) => {
    // In a real implementation, you might want to validate the callback
    // from Linkvertise to ensure it's legitimate
    
    // For now, we'll assume if they reached this endpoint, they passed through Linkvertise
    try {
      await markCheckpointPassed(req, checkpointNumber);
      
      // Redirect to next checkpoint or access page
      if (checkpointNumber < 3) {
        res.redirect(`/checkpoint/${checkpointNumber + 1}`);
      } else {
        res.redirect('/access');
      }
    } catch (error) {
      console.error('Error processing Linkvertise callback:', error);
      res.redirect(`/checkpoint/${checkpointNumber}`);
    }
  };
};

// Check if user has valid key and session
const checkValidKey = async (req, res, next) => {
  try {
    if (!req.session.keyId) {
      return next();
    }
    
    const key = await Key.findValidKey(
      req.session.keyId,
      req.sessionID,
      req.deviceFingerprint
    );
    
    if (!key) {
      // Key is invalid or expired, clear session
      delete req.session.keyId;
      delete req.session.checkpoints;
      return res.redirect('/checkpoint/1');
    }
    
    req.userKey = key;
    next();
  } catch (error) {
    console.error('Error checking valid key:', error);
    next();
  }
};

module.exports = {
  initializeSession,
  checkCheckpointAccess,
  markCheckpointPassed,
  validateLinkvertiseCallback,
  checkValidKey
};