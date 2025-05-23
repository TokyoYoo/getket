const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database Models
const Key = require('./models/Key');
const Settings = require('./models/Settings');

// Middleware setup
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Database connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log('MongoDB connection error:', err));

// Helper functions
const getClientIP = (req) => {
    return req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
};

const getUserId = (req) => {
    if (!req.session.userId) {
        req.session.userId = uuidv4();
    }
    return req.session.userId;
};

// Initialize default settings
const initializeSettings = async () => {
    const existingSettings = await Settings.findOne();
    if (!existingSettings) {
        const defaultSettings = new Settings({
            keyDuration: 24, // 24 hours
            linkvertiseIds: {
                checkpoint1: 572754,
                checkpoint2: 572754,
                checkpoint3: 572754
            },
            webhookUrl: '',
            webhookInterval: 60 // minutes
        });
        await defaultSettings.save();
    }
};

// Routes

// Home page - redirect to checkpoint 1
app.get('/', (req, res) => {
    res.redirect('/checkpoint/1');
});

// Checkpoint pages
app.get('/checkpoint/:id', async (req, res) => {
    const checkpointId = parseInt(req.params.id);
    const userId = getUserId(req);
    
    if (checkpointId < 1 || checkpointId > 3) {
        return res.redirect('/checkpoint/1');
    }
    
    // Check if user has completed previous checkpoints
    if (checkpointId > 1) {
        const requiredCheckpoint = checkpointId - 1;
        if (!req.session.completedCheckpoints || !req.session.completedCheckpoints.includes(requiredCheckpoint)) {
            return res.redirect(`/checkpoint/${requiredCheckpoint}`);
        }
    }
    
    const settings = await Settings.findOne() || {};
    const linkvertiseId = settings.linkvertiseIds?.[`checkpoint${checkpointId}`] || 572754;
    
    let nextUrl = checkpointId < 3 ? `/checkpoint/${checkpointId + 1}` : '/access';
    
    res.render('checkpoint', {
        checkpointId,
        linkvertiseId,
        nextUrl
    });
});

// Complete checkpoint (called after linkvertise redirect)
app.get('/complete-checkpoint/:id', (req, res) => {
    const checkpointId = parseInt(req.params.id);
    
    if (!req.session.completedCheckpoints) {
        req.session.completedCheckpoints = [];
    }
    
    if (!req.session.completedCheckpoints.includes(checkpointId)) {
        req.session.completedCheckpoints.push(checkpointId);
    }
    
    if (checkpointId < 3) {
        res.redirect(`/checkpoint/${checkpointId + 1}`);
    } else {
        res.redirect('/access');
    }
});

// Access page - get key
app.get('/access', async (req, res) => {
    // Check if user completed all checkpoints
    if (!req.session.completedCheckpoints || req.session.completedCheckpoints.length !== 3) {
        return res.redirect('/checkpoint/1');
    }
    
    const userId = getUserId(req);
    const userIP = getClientIP(req);
    
    // Check if user already has a valid key
    let existingKey = await Key.findOne({
        $or: [{ userId }, { userIP }],
        expiresAt: { $gt: new Date() }
    });
    
    if (existingKey) {
        return res.render('access', { key: existingKey.keyValue });
    }
    
    // Create new key
    const settings = await Settings.findOne() || {};
    const keyDuration = settings.keyDuration || 24;
    const expiresAt = new Date(Date.now() + keyDuration * 60 * 60 * 1000);
    
    const newKey = new Key({
        keyValue: uuidv4(),
        userId,
        userIP,
        expiresAt
    });
    
    await newKey.save();
    
    res.render('access', { key: newKey.keyValue });
});

// API Routes

// Validate key API
app.get('/api/validate-key', async (req, res) => {
    const { key } = req.query;
    
    if (!key) {
        return res.json({ valid: false, message: 'Key not provided' });
    }
    
    const keyDoc = await Key.findOne({
        keyValue: key,
        expiresAt: { $gt: new Date() }
    });
    
    if (keyDoc) {
        res.json({ valid: true, message: 'Key is valid' });
    } else {
        res.json({ valid: false, message: 'Key is invalid or expired' });
    }
});

// Admin Routes

// Admin login page
app.get('/admin', (req, res) => {
    if (req.session.isAdmin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login');
});

// Admin login
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin/login', { error: 'Invalid credentials' });
    }
});

// Admin logout
app.get('/admin/logout', (req, res) => {
    req.session.isAdmin = false;
    res.redirect('/admin');
});

// Admin middleware
const requireAdmin = (req, res, next) => {
    if (!req.session.isAdmin) {
        return res.redirect('/admin');
    }
    next();
};

// Admin dashboard
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
    const totalKeys = await Key.countDocuments();
    const activeKeys = await Key.countDocuments({ expiresAt: { $gt: new Date() } });
    const settings = await Settings.findOne() || {};
    
    res.render('admin/dashboard', {
        stats: { totalKeys, activeKeys },
        settings
    });
});

// Update settings
app.post('/admin/settings', requireAdmin, async (req, res) => {
    const {
        keyDuration,
        checkpoint1Id,
        checkpoint2Id,
        checkpoint3Id,
        webhookUrl,
        webhookInterval
    } = req.body;
    
    await Settings.findOneAndUpdate({}, {
        keyDuration: parseInt(keyDuration),
        linkvertiseIds: {
            checkpoint1: parseInt(checkpoint1Id),
            checkpoint2: parseInt(checkpoint2Id),
            checkpoint3: parseInt(checkpoint3Id)
        },
        webhookUrl,
        webhookInterval: parseInt(webhookInterval)
    }, { upsert: true });
    
    res.redirect('/admin/dashboard');
});

// Test webhook
app.post('/admin/test-webhook', requireAdmin, async (req, res) => {
    const settings = await Settings.findOne();
    if (!settings || !settings.webhookUrl) {
        return res.json({ success: false, message: 'Webhook URL not configured' });
    }
    
    try {
        await axios.post(settings.webhookUrl, {
            content: "🔑 **GetKey System Test**\n\nThis is a test webhook message!"
        });
        res.json({ success: true, message: 'Webhook sent successfully' });
    } catch (error) {
        res.json({ success: false, message: 'Failed to send webhook' });
    }
});

// Key management
app.get('/admin/keys', requireAdmin, async (req, res) => {
    const keys = await Key.find().sort({ createdAt: -1 }).limit(100);
    res.render('admin/keys', { keys });
});

// Delete key
app.delete('/admin/keys/:id', requireAdmin, async (req, res) => {
    await Key.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// Cleanup expired keys (runs every hour)
cron.schedule('0 * * * *', async () => {
    const deleted = await Key.deleteMany({ expiresAt: { $lt: new Date() } });
    console.log(`Cleaned up ${deleted.deletedCount} expired keys`);
});

// Send webhook notifications
const sendWebhookNotification = async () => {
    const settings = await Settings.findOne();
    if (!settings || !settings.webhookUrl) return;
    
    const totalKeys = await Key.countDocuments();
    const activeKeys = await Key.countDocuments({ expiresAt: { $gt: new Date() } });
    
    try {
        await axios.post(settings.webhookUrl, {
            content: `🔑 **GetKey System Stats**\n\n📊 Total Keys: ${totalKeys}\n✅ Active Keys: ${activeKeys}\n⏰ Updated: ${new Date().toLocaleString()}`
        });
    } catch (error) {
        console.log('Webhook notification failed:', error.message);
    }
};

// Schedule webhook notifications
let webhookJob = cron.schedule('*/60 * * * *', sendWebhookNotification, { scheduled: false });

// Update webhook schedule when settings change
const updateWebhookSchedule = async () => {
    const settings = await Settings.findOne();
    if (settings && settings.webhookInterval) {
        webhookJob.stop();
        webhookJob = cron.schedule(`*/${settings.webhookInterval} * * * *`, sendWebhookNotification);
    }
};

// Initialize
initializeSettings().then(() => {
    updateWebhookSchedule();
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});