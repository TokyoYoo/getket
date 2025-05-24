const express = require('express');
const router = express.Router();
const Key = require('../models/Key');
const adminAuth = require('../middleware/adminAuth');

// Apply auth check to all dashboard routes
router.use(adminAuth.checkAuth);

// Login page
router.get('/login', (req, res) => {
    if (req.session.adminAuthenticated) {
        return res.redirect('/dashboard');
    }
    
    res.render('dashboard/login', {
        title: 'Admin Login',
        error: null
    });
});

// Handle login
router.post('/login', adminAuth.authenticate);

// Logout
router.get('/logout', adminAuth.logout);

// Dashboard main page (protected)
router.get('/', adminAuth.requireAuth, async (req, res) => {
    try {
        // Get statistics
        const totalKeys = await Key.countDocuments();
        const activeKeys = await Key.countDocuments({ status: 'active' });
        const expiredKeys = await Key.countDocuments({ status: 'expired' });
        const revokedKeys = await Key.countDocuments({ status: 'revoked' });

        // Get recent keys
        const recentKeys = await Key.find()
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        // Calculate additional statistics
        const last24Hours = new Date();
        last24Hours.setHours(last24Hours.getHours() - 24);
        const keysLast24h = await Key.countDocuments({
            createdAt: { $gte: last24Hours }
        });

        res.render('dashboard/index', {
            title: 'Admin Dashboard',
            stats: {
                total: totalKeys,
                active: activeKeys,
                expired: expiredKeys,
                revoked: revokedKeys,
                last24h: keysLast24h
            },
            recentKeys: recentKeys
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('dashboard/index', {
            title: 'Admin Dashboard',
            error: 'Failed to load dashboard data',
            stats: null,
            recentKeys: []
        });
    }
});

// Keys management page
router.get('/keys', adminAuth.requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const status = req.query.status;
        const search = req.query.search;

        // Build query
        let query = {};
        if (status && ['active', 'expired', 'revoked'].includes(status)) {
            query.status = status;
        }
        if (search) {
            query.$or = [
                { keyValue: { $regex: search, $options: 'i' } },
                { ipAddress: { $regex: search, $options: 'i' } },
                { sessionId: { $regex: search, $options: 'i' } }
            ];
        }

        const keys = await Key.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const totalKeys = await Key.countDocuments(query);
        const totalPages = Math.ceil(totalKeys / limit);

        res.render('dashboard/keys', {
            title: 'Key Management',
            keys: keys,
            pagination: {
                current: page,
                total: totalPages,
                limit: limit,
                hasNext: page < totalPages,
                hasPrev: page > 1
            },
            filters: {
                status: status,
                search: search
            },
            totalKeys: totalKeys
        });

    } catch (error) {
        console.error('Keys management error:', error);
        res.render('dashboard/keys', {
            title: 'Key Management',
            error: 'Failed to load keys data',
            keys: [],
            pagination: null,
            filters: {},
            totalKeys: 0
        });
    }
});

// Delete key
router.delete('/keys/:keyId', adminAuth.requireAuth, async (req, res) => {
    try {
        const keyId = req.params.keyId;
        const deletedKey = await Key.findByIdAndDelete(keyId);

        if (!deletedKey) {
            return res.status(404).json({
                success: false,
                error: 'Key not found'
            });
        }

        res.json({
            success: true,
            message: 'Key deleted successfully'
        });

    } catch (error) {
        console.error('Delete key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete key'
        });
    }
});

// Revoke key
router.patch('/keys/:keyId/revoke', adminAuth.requireAuth, async (req, res) => {
    try {
        const keyId = req.params.keyId;
        const key = await Key.findByIdAndUpdate(
            keyId,
            { status: 'revoked' },
            { new: true }
        );

        if (!key) {
            return res.status(404).json({
                success: false,
                error: 'Key not found'
            });
        }

        res.json({
            success: true,
            message: 'Key revoked successfully',
            key: key
        });

    } catch (error) {
        console.error('Revoke key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to revoke key'
        });
    }
});

// Bulk operations
router.post('/keys/bulk', adminAuth.requireAuth, async (req, res) => {
    try {
        const { action, keyIds } = req.body;

        if (!action || !keyIds || !Array.isArray(keyIds)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request parameters'
            });
        }

        let result;
        switch (action) {
            case 'delete':
                result = await Key.deleteMany({ _id: { $in: keyIds } });
                break;
            case 'revoke':
                result = await Key.updateMany(
                    { _id: { $in: keyIds } },
                    { status: 'revoked' }
                );
                break;
            case 'cleanup_expired':
                result = await Key.deleteMany({ 
                    status: 'expired',
                    expiresAt: { $lt: new Date() }
                });
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid action'
                });
        }

        res.json({
            success: true,
            message: `Bulk ${action} completed`,
            affected: result.deletedCount || result.modifiedCount || 0
        });

    } catch (error) {
        console.error('Bulk operation error:', error);
        res.status(500).json({
            success: false,
            error: 'Bulk operation failed'
        });
    }
});

// Analytics page
router.get('/analytics', adminAuth.requireAuth, async (req, res) => {
    try {
        // Get analytics data
        const now = new Date();
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);

        // Daily key creation stats for last 30 days
        const dailyStats = await Key.aggregate([
            {
                $match: {
                    createdAt: { $gte: last30Days }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
            }
        ]);

        // Status distribution
        const statusStats = await Key.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Top IP addresses
        const topIPs = await Key.aggregate([
            {
                $group: {
                    _id: "$ipAddress",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]);

        res.render('dashboard/analytics', {
            title: 'Analytics',
            dailyStats: dailyStats,
            statusStats: statusStats,
            topIPs: topIPs
        });

    } catch (error) {
        console.error('Analytics error:', error);
        res.render('dashboard/analytics', {
            title: 'Analytics',
            error: 'Failed to load analytics data',
            dailyStats: [],
            statusStats: [],
            topIPs: []
        });
    }
});

// Settings page
router.get('/settings', adminAuth.requireAuth, (req, res) => {
    res.render('dashboard/settings', {
        title: 'Settings',
        settings: {
            keyExpiryHours: process.env.KEY_EXPIRY_HOURS || 24,
            linkvertiseUserId: process.env.LINKVERTISE_USER_ID || 572754,
            adminUsername: process.env.ADMIN_USERNAME || 'admin'
        }
    });
});

// API endpoint for dashboard stats (AJAX)
router.get('/api/stats', adminAuth.requireAuth, async (req, res) => {
    try {
        const stats = {
            total: await Key.countDocuments(),
            active: await Key.countDocuments({ status: 'active' }),
            expired: await Key.countDocuments({ status: 'expired' }),
            revoked: await Key.countDocuments({ status: 'revoked' })
        };

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;