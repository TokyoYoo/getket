const express = require('express');
const router = express.Router();
const Key = require('../models/Key');
const adminAuth = require('../middleware/adminAuth');
const moment = require('moment');

// Admin login page
router.get('/login', adminAuth.loginPage);

// Admin login handler
router.post('/login', adminAuth.login);

// Admin logout
router.post('/logout', adminAuth.logout);

// Dashboard main page
router.get('/', adminAuth.requireAuth, async (req, res) => {
    try {
        // Get statistics
        const totalKeys = await Key.countDocuments();
        const activeKeys = await Key.countDocuments({ 
            status: 'ACTIVE', 
            expiresAt: { $gt: new Date() } 
        });
        const expiredKeys = await Key.countDocuments({ 
            status: 'EXPIRED' 
        });
        const revokedKeys = await Key.countDocuments({ 
            status: 'REVOKED' 
        });

        // Get recent keys (last 50)
        const recentKeys = await Key.find()
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        // Add formatted dates and time remaining
        const formattedKeys = recentKeys.map(key => ({
            ...key,
            createdAtFormatted: moment(key.createdAt).format('YYYY-MM-DD HH:mm:ss'),
            expiresAtFormatted: moment(key.expiresAt).format('YYYY-MM-DD HH:mm:ss'),
            lastUsedFormatted: key.lastUsed ? moment(key.lastUsed).format('YYYY-MM-DD HH:mm:ss') : 'Never',
            timeRemaining: key.expiresAt > new Date() ? 
                moment.duration(moment(key.expiresAt).diff(moment())).humanize() : 
                'Expired',
            isExpired: key.expiresAt <= new Date(),
            ipAddressShort: key.ipAddress ? key.ipAddress.substring(0, 15) + '...' : 'Unknown'
        }));

        const stats = {
            total: totalKeys,
            active: activeKeys,
            expired: expiredKeys,
            revoked: revokedKeys
        };

        res.render('dashboard', {
            title: 'Admin Dashboard',
            stats: stats,
            keys: formattedKeys,
            moment: moment
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', {
            title: 'Dashboard Error',
            message: 'Failed to load dashboard data'
        });
    }
});

// API endpoint to get key statistics
router.get('/api/stats', adminAuth.isAdmin, async (req, res) => {
    try {
        const stats = await Promise.all([
            Key.countDocuments(),
            Key.countDocuments({ status: 'ACTIVE', expiresAt: { $gt: new Date() } }),
            Key.countDocuments({ status: 'EXPIRED' }),
            Key.countDocuments({ status: 'REVOKED' }),
            Key.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } })
        ]);

        res.json({
            success: true,
            stats: {
                total: stats[0],
                active: stats[1],
                expired: stats[2],
                revoked: stats[3],
                todayCreated: stats[4]
            }
        });
    } catch (error) {
        console.error('Stats API error:', error);
        res.json({ success: false, message: 'Failed to get statistics' });
    }
});

// API endpoint to get keys with pagination
router.get('/api/keys', adminAuth.isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status;
        const search = req.query.search;

        const query = {};
        if (status && status !== 'all') {
            query.status = status.toUpperCase();
        }
        if (search) {
            query.$or = [
                { keyValue: { $regex: search, $options: 'i' } },
                { ipAddress: { $regex: search, $options: 'i' } },
                { sessionId: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await Key.countDocuments(query);
        const keys = await Key.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .lean();

        const formattedKeys = keys.map(key => ({
            ...key,
            createdAtFormatted: moment(key.createdAt).format('YYYY-MM-DD HH:mm:ss'),
            expiresAtFormatted: moment(key.expiresAt).format('YYYY-MM-DD HH:mm:ss'),
            lastUsedFormatted: key.lastUsed ? moment(key.lastUsed).format('YYYY-MM-DD HH:mm:ss') : 'Never',
            timeRemaining: key.expiresAt > new Date() ? 
                moment.duration(moment(key.expiresAt).diff(moment())).humanize() : 
                'Expired',
            isExpired: key.expiresAt <= new Date()
        }));

        res.json({
            success: true,
            keys: formattedKeys,
            pagination: {
                current: page,
                total: Math.ceil(total / limit),
                count: total,
                limit: limit
            }
        });
    } catch (error) {
        console.error('Keys API error:', error);
        res.json({ success: false, message: 'Failed to get keys' });
    }
});

// Delete specific key
router.delete('/api/keys/:keyId', adminAuth.isAdmin, async (req, res) => {
    try {
        const keyId = req.params.keyId;
        const result = await Key.findByIdAndDelete(keyId);
        
        if (!result) {
            return res.json({ success: false, message: 'Key not found' });
        }

        res.json({ success: true, message: 'Key deleted successfully' });
    } catch (error) {
        console.error('Delete key error:', error);
        res.json({ success: false, message: 'Failed to delete key' });
    }
});

// Revoke specific key
router.patch('/api/keys/:keyId/revoke', adminAuth.isAdmin, async (req, res) => {
    try {
        const keyId = req.params.keyId;
        const result = await Key.findByIdAndUpdate(
            keyId, 
            { status: 'REVOKED' }, 
            { new: true }
        );
        
        if (!result) {
            return res.json({ success: false, message: 'Key not found' });
        }

        res.json({ success: true, message: 'Key revoked successfully', key: result });
    } catch (error) {
        console.error('Revoke key error:', error);
        res.json({ success: false, message: 'Failed to revoke key' });
    }
});

// Bulk delete expired keys
router.delete('/api/keys/expired', adminAuth.isAdmin, async (req, res) => {
    try {
        const result = await Key.deleteMany({ 
            $or: [
                { status: 'EXPIRED' },
                { expiresAt: { $lt: new Date() } }
            ]
        });

        res.json({ 
            success: true, 
            message: `Deleted ${result.deletedCount} expired keys`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Bulk delete error:', error);
        res.json({ success: false, message: 'Failed to delete expired keys' });
    }
});

// Clean up and update expired keys status
router.post('/api/cleanup', adminAuth.isAdmin, async (req, res) => {
    try {
        // Update expired keys status
        const updateResult = await Key.updateMany(
            { expiresAt: { $lt: new Date() }, status: 'ACTIVE' },
            { status: 'EXPIRED' }
        );

        // Optionally delete old expired keys (older than 7 days)
        const deleteOldResult = await Key.deleteMany({
            status: 'EXPIRED',
            expiresAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });

        res.json({
            success: true,
            message: 'Cleanup completed',
            updatedKeys: updateResult.matchedCount,
            deletedOldKeys: deleteOldResult.deletedCount
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.json({ success: false, message: 'Cleanup failed' });
    }
});

// Export keys data (CSV format)
router.get('/export', adminAuth.requireAuth, async (req, res) => {
    try {
        const keys = await Key.find().lean();
        
        // Create CSV content
        const csvHeader = 'Key,Status,Created,Expires,IP Address,Usage Count,Last Used\n';
        const csvContent = keys.map(key => {
            return [
                key.keyValue,
                key.status,
                moment(key.createdAt).format('YYYY-MM-DD HH:mm:ss'),
                moment(key.expiresAt).format('YYYY-MM-DD HH:mm:ss'),
                key.ipAddress,
                key.usageCount,
                key.lastUsed ? moment(key.lastUsed).format('YYYY-MM-DD HH:mm:ss') : 'Never'
            ].join(',');
        }).join('\n');

        const csv = csvHeader + csvContent;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=keys-export-${moment().format('YYYY-MM-DD')}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).send('Export failed');
    }
});

module.exports = router;