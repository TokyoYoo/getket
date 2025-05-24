const Key = require('../models/Key');

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
      // Remove expired key
      await Key.deleteOne({ _id: key._id });
      return res.status(401).json({
        error: 'Key expired',
        message: 'The provided key has expired'
      });
    }
    
    // Add key info to request object
    req.keyInfo = {
      id: key._id,
      key: key.key,
      sessionId: key.sessionId,
      ipAddress: key.ipAddress,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt
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

// Middleware to validate IP address (optional security layer)
const validateIP = async (req, res, next) => {
  try {
    const keyString = req.headers['x-api-key'] || req.query.key || req.body.key;
    const currentIP = req.ip || req.connection.remoteAddress;
    
    if (keyString) {
      const key = await Key.findOne({ key: keyString });
      
      if (key && key.ipAddress !== currentIP) {
        return res.status(403).json({
          error: 'IP mismatch',
          message: 'This key is associated with a different IP address'
        });
      }
    }
    
    next();
    
  } catch (error) {
    console.error('IP validation error:', error);
    next(); // Continue even if IP validation fails
  }
};

// Rate limiting middleware (simple implementation)
const rateLimits = new Map();

const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!rateLimits.has(ip)) {
      rateLimits.set(ip, []);
    }
    
    const requests = rateLimits.get(ip);
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => time > windowStart);
    rateLimits.set(ip, validRequests);
    
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
  
  for (const [ip, requests] of rateLimits.entries()) {
    const validRequests = requests.filter(time => time > (now - windowMs));
    
    if (validRequests.length === 0) {
      rateLimits.delete(ip);
    } else {
      rateLimits.set(ip, validRequests);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

module.exports = {
  requireValidKey,
  requireCheckpoints,
  validateIP,
  rateLimit
};