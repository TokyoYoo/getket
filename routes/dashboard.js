const express = require('express');
const router = express.Router();
const Key = require('../models/Key');

// Dashboard - Display all keys
router.get('/', async (req, res) => {
  try {
    // Get all keys, sorted by creation date (newest first)
    const keys = await Key.find({}).sort({ createdAt: -1 });
    
    // Separate active and expired keys
    const activeKeys = [];
    const expiredKeys = [];
    
    for (const key of keys) {
      if (key.isExpired()) {
        expiredKeys.push(key);
      } else {
        activeKeys.push(key);
      }
    }
    
    // Get statistics
    const stats = {
      total: keys.length,
      active: activeKeys.length,
      expired: expiredKeys.length
    };
    
    res.render('dashboard', {
      title: 'Key Management Dashboard',
      activeKeys: activeKeys,
      expiredKeys: expiredKeys,
      stats: stats
    });
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).render('error', {
      title: 'Dashboard Error',
      message: 'Unable to load dashboard. Please try again.'
    });
  }
});

// Delete key
router.post('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await Key.findByIdAndDelete(id);
    
    res.json({ success: true, message: 'Key deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting key:', error);
    res.status(500).json({ success: false, message: 'Error deleting key' });
  }
});

// Clean expired keys
router.post('/clean-expired', async (req, res) => {
  try {
    const result = await Key.deleteMany({
      expiresAt: { $lte: new Date() }
    });
    
    res.json({ 
      success: true, 
      message: `Deleted ${result.deletedCount} expired keys` 
    });
    
  } catch (error) {
    console.error('Error cleaning expired keys:', error);
    res.status(500).json({ success: false, message: 'Error cleaning expired keys' });
  }
});

// Get key details
router.get('/key/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const key = await Key.findById(id);
    
    if (!key) {
      return res.status(404).json({ success: false, message: 'Key not found' });
    }
    
    res.json({
      success: true,
      key: {
        id: key._id,
        key: key.key,
        sessionId: key.sessionId,
        ipAddress: key.ipAddress,
        userAgent: key.userAgent,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        remainingTime: key.getRemainingTime(),
        isExpired: key.isExpired()
      }
    });
    
  } catch (error) {
    console.error('Error getting key details:', error);
    res.status(500).json({ success: false, message: 'Error retrieving key details' });
  }
});

// API endpoint for dashboard stats
router.get('/api/stats', async (req, res) => {
  try {
    const totalKeys = await Key.countDocuments({});
    const activeKeys = await Key.countDocuments({
      expiresAt: { $gt: new Date() }
    });
    const expiredKeys = totalKeys - activeKeys;
    
    // Keys created in last 24 hours
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentKeys = await Key.countDocuments({
      createdAt: { $gte: last24h }
    });
    
    res.json({
      total: totalKeys,
      active: activeKeys,
      expired: expiredKeys,
      recent24h: recentKeys
    });
    
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;