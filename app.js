// app.js - Main application file
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI
    }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Import models
const Key = require('./models/Key');
const Admin = require('./models/Admin');
const Config = require('./models/Config');

// Routes
const checkpointRoutes = require('./routes/checkpoint');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

app.use('/', checkpointRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Default route
app.get('/', (req, res) => {
    res.redirect('/checkpoint/1');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        error: 'Something went wrong!',
        message: err.message 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', { 
        error: 'Page Not Found',
        message: 'The requested page could not be found.' 
    });
});

// Cleanup expired keys every hour
cron.schedule('0 * * * *', async () => {
    try {
        const result = await Key.deleteMany({
            expiresAt: { $lt: new Date() }
        });
        console.log(`Cleaned up ${result.deletedCount} expired keys`);
    } catch (error) {
        console.error('Error cleaning up expired keys:', error);
    }
});

// Webhook notification system
async function sendWebhookNotification() {
    try {
        const config = await Config.findOne();
        if (!config || !config.webhookUrl) return;

        const totalKeys = await Key.countDocuments();
        const activeKeys = await Key.countDocuments({
            expiresAt: { $gt: new Date() }
        });

        const payload = {
            embeds: [{
                title: "🔑 GetKey System Statistics",
                color: 0x00ff00,
                fields: [
                    {
                        name: "Total Keys Created",
                        value: totalKeys.toString(),
                        inline: true
                    },
                    {
                        name: "Active Keys",
                        value: activeKeys.toString(),
                        inline: true
                    },
                    {
                        name: "Last Updated",
                        value: new Date().toISOString(),
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString()
            }]
        };

        await axios.post(config.webhookUrl, payload);
        console.log('Webhook notification sent successfully');
    } catch (error) {
        console.error('Error sending webhook notification:', error);
    }
}

// Schedule webhook notifications
cron.schedule('*/60 * * * *', sendWebhookNotification); // Every 60 minutes

// Initialize default admin account if none exists
async function initializeAdmin() {
    try {
        const adminExists = await Admin.findOne();
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await new Admin({
                username: 'admin',
                password: hashedPassword
            }).save();
            console.log('Default admin account created: admin/admin123');
        }

        // Initialize default config
        const configExists = await Config.findOne();
        if (!configExists) {
            await new Config({
                keyExpirationHours: 24,
                linkvertiseId1: 572754,
                linkvertiseId2: 572754,
                linkvertiseId3: 572754,
                webhookUrl: '',
                webhookInterval: 60
            }).save();
            console.log('Default configuration created');
        }
    } catch (error) {
        console.error('Error initializing admin:', error);
    }
}

app.listen(PORT, () => {
    console.log(`GetKey System running on port ${PORT}`);
    initializeAdmin();
});

module.exports = app;