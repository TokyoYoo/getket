const express = require('express');
const router = express.Router();
const Key = require('../models/Key');

// API endpoint for Lua script to verify keys
router.get('/verify-key/:key', async (req, res) => {
  try {
    const keyToVerify = req.params.key;
    const clientIP = req.ip;
    const userAgent = req.get('User-Agent') || 'unknown';
    const deviceFingerprint = `${clientIP}-${userAgent}`;
    
    // Find the key in database
    const keyRecord = await Key.findOne({ 
      key: keyToVerify,
      status: 'active'
    });
    
    if (!keyRecord) {
      return res.json({ 
        valid: false, 
        reason: 'Key not found',
        timestamp: new Date().toISOString()
      });
    }
    
    // Check if key is expired
    if (keyRecord.isExpired) {
      // Update key status and clean up
      await Key.deleteOne({ _id: keyRecord._id });
      
      return res.json({ 
        valid: false, 
        reason: 'Key expired',
        timestamp: new Date().toISOString()
      });
    }
    
    // Verify device fingerprint (optional, for extra security)
    if (keyRecord.deviceFingerprint !== deviceFingerprint) {
      console.log(`Device fingerprint mismatch for key ${keyToVerify}`);
      console.log(`Expected: ${keyRecord.deviceFingerprint}`);
      console.log(`Received: ${deviceFingerprint}`);
      
      // You can decide whether to reject or just log this
      // For now, we'll allow it but log the discrepancy
    }
    
    // Key is valid
    res.json({ 
      valid: true, 
      expiresAt: keyRecord.expiresAt,
      timeRemaining: keyRecord.timeRemaining,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Key verification error:', error);
    res.status(500).json({ 
      valid: false, 
      reason: 'Server error',
      timestamp: new Date().toISOString()
    });
  }
});

// API endpoint to get key status (for web interface)
router.get('/key-status/:key', async (req, res) => {
  try {
    const keyToCheck = req.params.key;
    
    const keyRecord = await Key.findOne({ 
      key: keyToCheck 
    }).lean();
    
    if (!keyRecord) {
      return res.json({ 
        exists: false,
        timestamp: new Date().toISOString()
      });
    }
    
    const isExpired = new Date() > keyRecord.expiresAt;
    const timeRemaining = isExpired ? null : {
      hours: Math.floor((keyRecord.expiresAt - new Date()) / (1000 * 60 * 60)),
      minutes: Math.floor(((keyRecord.expiresAt - new Date()) % (1000 * 60 * 60)) / (1000 * 60))
    };
    
    res.json({
      exists: true,
      valid: !isExpired && keyRecord.status === 'active',
      expired: isExpired,
      status: keyRecord.status,
      createdAt: keyRecord.createdAt,
      expiresAt: keyRecord.expiresAt,
      timeRemaining: timeRemaining,
      checkpointProgress: keyRecord.checkpointProgress,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Key status error:', error);
    res.status(500).json({ 
      error: 'Server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API endpoint to get system statistics (public, limited info)
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const stats = {
      activeKeys: await Key.countDocuments({ 
        expiresAt: { $gt: now },
        status: 'active'
      }),
      keysGeneratedLastHour: await Key.countDocuments({
        createdAt: { $gt: oneHourAgo }
      }),
      timestamp: now.toISOString()
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Public stats error:', error);
    res.status(500).json({ 
      error: 'Unable to fetch statistics',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;