// middleware/sessionManager.js
const Key = require('../models/Key');

// Middleware to check if key exists and is valid
const validateKeyMiddleware = async (req, res, next) => {
  try {
    const { key } = req.query;
    
    if (!key) {
      return res.redirect('/checkpoint/1');
    }
    
    // Find the key in database
    const keyDoc = await Key.findOne({ key: key });
    
    if (!keyDoc) {
      // Key not found, redirect to checkpoint
      return res.redirect('/checkpoint/1');
    }
    
    if (keyDoc.isExpired()) {
      // Key expired, delete it and redirect
      await Key.findByIdAndDelete(keyDoc._id);
      
      // Also destroy the session if it exists
      if (keyDoc.sessionId && req.sessionStore && req.sessionStore.destroy) {
        req.sessionStore.destroy(keyDoc.sessionId, (err) => {
          if (err) {
            console.error('Error destroying expired session:', err);
          }
        });
      }
      
      return res.redirect('/checkpoint/1');
    }
    
    // Key is valid, attach to request
    req.validKey = keyDoc;
    next();
    
  } catch (error) {
    console.error('Error validating key:', error);
    res.redirect('/checkpoint/1');
  }
};

// Middleware to automatically clean expired keys
const cleanExpiredKeysMiddleware = async (req, res, next) => {
  try {
    // Run cleanup occasionally (every 10th request)
    if (Math.random() > 0.9) {
      const expiredKeys = await Key.find({
        expiresAt: { $lte: new Date() }
      });
      
      const sessionIds = expiredKeys.map(key => key.sessionId).filter(Boolean);
      
      // Delete expired keys
      await Key.deleteMany({
        expiresAt: { $lte: new Date() }
      });
      
      // Destroy associated sessions
      if (req.sessionStore && req.sessionStore.destroy && sessionIds.length > 0) {
        sessionIds.forEach(sessionId => {
          req.sessionStore.destroy(sessionId, (err) => {
            if (err) {
              console.error(`Error destroying session ${sessionId}:`, err);
            }
          });
        });
      }
      
      if (expiredKeys.length > 0) {
        console.log(`Cleaned ${expiredKeys.length} expired keys and ${sessionIds.length} sessions`);
      }
    }
    
    next();
  } catch (error) {
    console.error('Error in cleanup middleware:', error);
    next(); // Continue even if cleanup fails
  }
};

// Function to invalidate all sessions for a specific user
const invalidateUserSessions = async (sessionId, sessionStore) => {
  return new Promise((resolve, reject) => {
    if (!sessionStore || !sessionStore.destroy) {
      return resolve();
    }
    
    sessionStore.destroy(sessionId, (err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return reject(err);
      }
      resolve();
    });
  });
};

// Enhanced key deletion with session cleanup
const deleteKeyWithSession = async (keyId, sessionStore) => {
  try {
    // Find the key first to get session ID
    const key = await Key.findById(keyId);
    
    if (!key) {
      throw new Error('Key not found');
    }
    
    const sessionId = key.sessionId;
    
    // Delete the key
    await Key.findByIdAndDelete(keyId);
    
    // Invalidate the session
    if (sessionId) {
      await invalidateUserSessions(sessionId, sessionStore);
    }
    
    return {
      success: true,
      message: 'Key and session deleted successfully',
      sessionId: sessionId
    };
    
  } catch (error) {
    throw error;
  }
};

// Function to create test environment keys
const createTestKeys = async (count = 3, expireSeconds = 300) => {
  const testKeys = [];
  const expirationDate = new Date(Date.now() + (expireSeconds * 1000));
  
  for (let i = 1; i <= count; i++) {
    const keyValue = await Key.generateUniqueKey();
    const testKey = new Key({
      key: keyValue,
      sessionId: `test-session-${Date.now()}-${i}`,
      ipAddress: '127.0.0.1',
      userAgent: 'Test Environment',
      expiresAt: expirationDate,
      isActive: true
    });
    
    await testKey.save();
    testKeys.push(testKey);
  }
  
  return testKeys;
};

// Function to check and update key expiration in real-time
const updateKeyExpiration = async (keyId, newExpirationDate) => {
  try {
    const key = await Key.findByIdAndUpdate(
      keyId,
      { $set: { expiresAt: newExpirationDate } },
      { new: true }
    );
    
    if (!key) {
      throw new Error('Key not found');
    }
    
    return key;
  } catch (error) {
    throw error;
  }
};

// Function to get real-time key statistics
const getKeyStatistics = async () => {
  try {
    const now = new Date();
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const [
      totalKeys,
      activeKeys,
      expiredKeys,
      expiringSoon,
      expiringToday,
      recentKeys
    ] = await Promise.all([
      Key.countDocuments({}),
      Key.countDocuments({ expiresAt: { $gt: now } }),
      Key.countDocuments({ expiresAt: { $lte: now } }),
      Key.countDocuments({ expiresAt: { $gt: now, $lte: nextHour } }),
      Key.countDocuments({ expiresAt: { $gt: now, $lte: next24Hours } }),
      Key.countDocuments({ createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } })
    ]);
    
    return {
      total: totalKeys,
      active: activeKeys,
      expired: expiredKeys,
      expiringSoon: expiringSoon,
      expiringToday: expiringToday,
      recent24h: recentKeys
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  validateKeyMiddleware,
  cleanExpiredKeysMiddleware,
  invalidateUserSessions,
  deleteKeyWithSession,
  createTestKeys,
  updateKeyExpiration,
  getKeyStatistics
};