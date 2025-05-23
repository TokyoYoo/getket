// routes/admin.js - Admin dashboard and management routes
const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const router = express.Router();

const Admin = require('../models/Admin');
const Config = require('../models/Config');
const Key = require('../models/Key');

// Authentication middleware
async function requireAuth(req, res, next) {
    if (!req.session.adminId) {
        return res.redirect('/admin/login');
    }
    
    try {
        const admin = await Admin.findById(req.session.adminId);
        if (!admin || !admin.isActive) {
            req.session.adminId = null;
            return res.redirect('/admin/login');
        }
        
        req.admin = admin;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        req.session.adminId = null;
        res.redirect('/admin/login');
    }
}

// Admin login page
router.get('/login', (req, res) => {
    if (req.session.adminId) {
        return res.redirect('/admin/dashboard');
    }
    
    res.render('admin/login', {
        title: 'Admin Login',
        error: req.query.error || null
    });
});

// Admin login handler
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.redirect('/admin/login?error=Missing credentials');
        }
        
        const admin = await Admin.findOne({ username: username });
        
        if (!admin) {
            return res.redirect('/admin/login?error=Invalid credentials');
        }
        
        if (admin.isLocked) {
            return res.redirect('/admin/login?error=Account locked. Try again later.');
        }
        
        const isValidPassword = await bcrypt.compare(password, admin.password);
        
        if (!isValidPassword) {
            await admin.incrementLoginAttempts();
            return res.redirect('/admin/login?error=Invalid credentials');
        }
        
        // Reset login attempts and set session
        await admin.resetLoginAttempts();
        req.session.adminId = admin._id;
        
        res.redirect('/admin/dashboard');
        
    } catch (error) {
        console.error('Login error:', error);
        res.redirect('/admin/login?error=Server error');
    }
});

// Admin logout
router.get('/logout', (req, res) => {
    req.session.adminId = null;
    res.redirect('/admin/login');
});

// Admin dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const totalKeys = await Key.countDocuments();
        const activeKeys = await Key.countDocuments({
            expiresAt: { $gt: new Date() }
        });
        const completedKeys = await Key.countDocuments({
            step: 4
        });
        const todayKeys = await Key.countDocuments({
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });
        
        const recentKeys = await Key.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .select('keyId ip step createdAt expiresAt checkpoints');
        
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            admin: req.admin,
            stats: {
                totalKeys,
                activeKeys,
                completedKeys,
                expiredKeys: totalKeys - activeKeys,
                todayKeys
            },
            recentKeys
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { 
            error: 'Internal Server Error',
            message: 'Unable to load dashboard' 
        });
    }
});

// Key management page
router.get('/keys', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;
        
        const filter = {};
        if (req.query.status === 'active') {
            filter.expiresAt = { $gt: new Date() };
        } else if (req.query.status === 'expired') {
            filter.expiresAt = { $lte: new Date() };
        } else if (req.query.status === 'completed') {
            filter.step = 4;
        }
        
        const totalKeys = await Key.countDocuments(filter);
        const keys = await Key.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        const totalPages = Math.ceil(totalKeys / limit);
        
        res.render('admin/keys', {
            title: 'Key Management',
            admin: req.admin,
            keys,
            currentPage: page,
            totalPages,
            totalKeys,
            filter: req.query.status || 'all'
        });
        
    } catch (error) {
        console.error('Keys page error:', error);
        res.status(500).render('error', { 
            error: 'Internal Server Error',
            message: 'Unable to load keys' 
        });
    }
});

// Settings page
router.get('/settings', requireAuth, async (req, res) => {
    try {
        const config = await Config.getSingle();
        
        res.render('admin/settings', {
            title: 'System Settings',
            admin: req.admin,
            config,
            message: req.query.message || null,
            error: req.query.error || null
        });
        
    } catch (error) {
        console.error('Settings page error:', error);
        res.status(500).render('error', { 
            error: 'Internal Server Error',
            message: 'Unable to load settings' 
        });
    }
});

// Update settings
router.post('/settings', requireAuth, async (req, res) => {
    try {
        const config = await Config.getSingle();
        
        const {
            keyExpirationHours,
            linkvertiseId1,
            linkvertiseId2,
            linkvertiseId3,
            webhookUrl,
            webhookInterval,
            isWebhookEnabled,
            systemMessage
        } = req.body;
        
        await config.updateSettings({
            keyExpirationHours: parseInt(keyExpirationHours) || 24,
            linkvertiseId1: parseInt(linkvertiseId1) || 572754,
            linkvertiseId2: parseInt(linkvertiseId2) || 572754,
            linkvertiseId3: parseInt(linkvertiseId3) || 572754,
            webhookUrl: webhookUrl || '',
            webhookInterval: parseInt(webhookInterval) || 60,
            isWebhookEnabled: isWebhookEnabled === 'on',
            systemMessage: systemMessage || 'Complete all checkpoints to get your key!'
        });
        
        res.redirect('/admin/settings?message=Settings updated successfully');
        
    } catch (error) {
        console.error('Settings update error:', error);
        res.redirect('/admin/settings?error=Failed to update settings');
    }
});

// Test webhook
router.post('/test-webhook', requireAuth, async (req, res) => {
    try {
        const config = await Config.getSingle();
        
        if (!config.webhookUrl) {
            return res.json({
                success: false,
                message: 'Webhook URL not configured'
            });
        }
        
        const testPayload = {
            embeds: [{
                title: "🧪 Webhook Test",
                description: "This is a test message from GetKey System",
                color: 0x00ff00,
                fields: [
                    {
                        name: "Status",
                        value: "✅ Working correctly",
                        inline: true
                    },
                    {
                        name: "Test Time",
                        value: new Date().toISOString(),
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            }]
        };
        
        const response = await axios.post(config.webhookUrl, testPayload);
        
        if (response.status === 204) {
            res.json({
                success: true,
                message: 'Webhook test successful'
            });
        } else {
            res.json({
                success: false,
                message: 'Webhook test failed'
            });
        }
        
    } catch (error) {
        console.error('Webhook test error:', error);
        res.json({
            success: false,
            message: `Webhook test failed: ${error.message}`
        });
    }
});

// Delete key
router.delete('/keys/:keyId', requireAuth, async (req, res) => {
    try {
        const { keyId } = req.params;
        const result = await Key.deleteOne({ keyId: keyId });
        
        if (result.deletedCount > 0) {
            res.json({
                success: true,
                message: 'Key deleted successfully'
            });
        } else {
            res.json({
                success: false,
                message: 'Key not found'
            });
        }
        
    } catch (error) {
        console.error('Delete key error:', error);
        res.json({
            success: false,
            message: 'Failed to delete key'
        });
    }
});

// Cleanup expired keys
router.post('/cleanup', requireAuth, async (req, res) => {
    try {
        const result = await Key.deleteMany({
            expiresAt: { $lt: new Date() }
        });
        
        res.json({
            success: true,
            message: `Cleaned up ${result.deletedCount} expired keys`
        });
        
    } catch (error) {
        console.error('Cleanup error:', error);
        res.json({
            success: false,
            message: 'Failed to cleanup expired keys'
        });
    }
});

module.exports = router;