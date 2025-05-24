const Key = require('../models/Key');
const crypto = require('crypto');

// Function to generate browser fingerprint
function generateFingerprint(req) {
  const userAgent = req.get('User-Agent') || '';
  const acceptLanguage = req.get('Accept-Language') || '';
  const acceptEncoding = req.get('Accept-Encoding') || '';
  const ip = req.ip || req.connection.remoteAddress || '';
  
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

// Middleware to check if user has valid key
const requireValidKey = async (req, res, next) => {
  try {
    const keyString = req.headers['x-api-key'] || req.query.key || req.body.key;
    
    if (!keyString) {
      return res.status(401).json({
        error: 'API key required',
        message: 'Please provide a valid API key'
      });
    }
    
    const key = await Key.findOne({ key: keyString });
    
    if (!key) {
      return res.status(401).json({
        error: 'Invalid key',
        message: 'The provided key is not valid'
      });
    }
    
    if (key.isExpired()) {
      // Clean session when key expires
      await cleanSessionData(key.sessionId);
      await Key.deleteOne({ _id: key._id });
      return res.status(401).json({
        error: 'Key expired',
        message: 'The provided key has expired'
      });
    }
    
    // Update last accessed time
    await key.updateLastAccessed();
    
    // Add key info to request object
    req.keyInfo = {
      id: key._id,
      key: key.key,
      sessionId: key.sessionId,
      fingerprint: key.fingerprint,
      ipAddress: key.ipAddress,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      lastAccessed: key.lastAccessed
    };
    
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred while validating the key'
    });
  }
};

// Middleware to check if user has completed checkpoints
const requireCheckpoints = (checkpoints = [1, 2, 3]) => {
  return (req, res, next) => {
    const session = req.session;
    
    for (const checkpoint of checkpoints) {
      if (!session[`passed${checkpoint}`]) {
        return res.redirect('/checkpoint/1');
      }
    }
    
    next();
  };
};

// Enhanced middleware to validate fingerprint and IP
const validateFingerprint = async (req, res, next) => {
  try {
    const keyString = req.headers['x-api-key'] || req.query.key || req.body.key;
    const currentFingerprint = generateFingerprint(req);
    
    if (keyString) {
      const key = await Key.findOne({ key: keyString });
      
      if (key && key.fingerprint !== currentFingerprint) {
        return res.status(403).json({
          error: 'Fingerprint mismatch',
          message: 'This key is associated with a different browser/device'
        });
      }
    }
    
    next();
    
  } catch (error) {
    console.error('Fingerprint validation error:', error);
    next(); // Continue even if fingerprint validation fails
  }
};

// Rate limiting middleware (enhanced with fingerprint)
const rateLimits = new Map();

const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const fingerprint = generateFingerprint(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!rateLimits.has(fingerprint)) {
      rateLimits.set(fingerprint, []);
    }
    
    const requests = rateLimits.get(fingerprint);
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => time > windowStart);
    rateLimits.set(fingerprint, validRequests);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.'
      });
    }
    
    // Add current request
    validRequests.push(now);
    
    next();
  };
};

// Clean up expired rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  
  for (const [fingerprint, requests] of rateLimits.entries()) {
    const validRequests = requests.filter(time => time > (now - windowMs));
    
    if (validRequests.length === 0) {
      rateLimits.delete(fingerprint);
    } else {
      rateLimits.set(fingerprint, validRequests);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

// Cleanup job scheduler
const scheduleCleanup = () => {
  // Clean expired keys and sessions every 10 minutes
  setInterval(async () => {
    try {
      await Key.cleanupExpiredKeys();
    } catch (error) {
      console.error('Scheduled cleanup error:', error);
    }
  }, 10 * 60 * 1000);
  
  // Clean unused sessions every 30 minutes
  setInterval(async () => {
    try {
      await Key.cleanupUnusedSessions();
    } catch (error) {
      console.error('Scheduled session cleanup error:', error);
    }
  }, 30 * 60 * 1000);
  
  console.log('Cleanup jobs scheduled');
};

module.exports = {
  requireValidKey,
  requireCheckpoints,
  validateFingerprint,
  rateLimit,
  scheduleCleanup,
  generateFingerprint,
  cleanSessionData
};