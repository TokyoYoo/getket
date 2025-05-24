const express = require('express');
const router = express.Router();
const Key = require('../models/Key');
const { adminAuth, adminLogout } = require('../middleware/adminAuth');
const { performManualCleanup, getCleanupStats } = require('../utils/cleanup');

// All dashboard routes require admin authentication
router.use(adminAuth);

// Main dashboard
router.get('/', async (req, res) => {
  try {
    // Get all keys with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Get filter parameters
    const status = req.query.status || 'all';
    const sortBy = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    
    // Build query
    let query = {};
    if (status === 'active') {
      query = { 
        expiresAt: { $gt: new Date() },
        status: 'active'
      };
    } else if (status === 'expired') {
      query = {
        $or: [
          { expiresAt: { $lt: new Date() } },
          { status: 'expired' }
        ]
      };
    }
    
    // Get keys and total count
    const [keys, totalKeys, stats] = await Promise.all([
      Key.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Key.countDocuments(query),
      getCleanupStats()
    ]);
    
    // Calculate pagination
    const totalPages = Math.ceil(totalKeys / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.render('dashboard', {
      title: 'Admin Dashboard',
      keys: keys,
      stats: stats,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        hasNextPage: hasNextPage,
        hasPrevPage: hasPrevPage,
        limit: limit
      },
      filters: {
        status: status,
        sortBy: sortBy,
        sortOrder: req.query.order || 'desc'
      }
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('layout', {
      title: 'Dashboard Error',
      body: `
        <div class="container">
          <div class="error-box">
            <h2>Dashboard Error</h2>
            <p>Unable to load dashboard data.</p>
            <a href="/dashboard" class="btn">Try Again</a>
          </div>
        </div>
      `
    });
  }
});

// Delete specific key
router.post('/delete/:keyId', async (req, res) => {
  try {
    const keyId = req.params.keyId;
    const result = await Key.deleteOne({ key: keyId });
    
    if (result.deletedCount > 0) {
      res.json({ success: true, message: 'Key deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Key not found' });
    }
  } catch (error) {
    console.error('Delete key error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete key' });
  }
});

// Bulk delete expired keys
router.post('/cleanup', async (req, res) => {
  try {
    const cleanedCount = await performManualCleanup();
    res.json({ 
      success: true, 
      message: `Cleanup completed: ${cleanedCount} expired keys removed` 
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ success: false, message: 'Cleanup failed' });
  }
});

// Get key details (AJAX endpoint)
router.get('/key/:keyId', async (req, res) => {
  try {
    const key = await Key.findOne({ key: req.params.keyId }).lean();
    
    if (!key) {
      return res.status(404).json({ error: 'Key not found' });
    }
    
    res.json({
      key: key.key,
      sessionId: key.sessionId,
      ipAddress: key.ipAddress,
      deviceFingerprint: key.deviceFingerprint,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      status: key.status,
      checkpointProgress: key.checkpointProgress,
      isExpired: new Date() > key.expiresAt
    });
  } catch (error) {
    console.error('Get key details error:', error);
    res.status(500).json({ error: 'Failed to get key details' });
  }
});

// Dashboard statistics API
router.get('/api/stats', async (req, res) => {
  try {
    const stats = await getCleanupStats();
    res.json(stats);
  } catch (error) {
    console.error('Stats API error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Admin logout
router.post('/logout', (req, res) => {
  adminLogout(req, res);
});

module.exports = router;