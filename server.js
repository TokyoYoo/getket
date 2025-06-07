const express = require('express');
const path = require('path');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
const { connectDB, getDB } = require('./db/connection');
const { generateSessionId, getBrowserFingerprint } = require('./utils/generateKey');

// Import routes
const check1Router = require('./routes/check1');
const check2Router = require('./routes/check2');
const check3Router = require('./routes/check3');
const createKeyRouter = require('./routes/create_key');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Routes
app.use('/check1', check1Router);
app.use('/check2', check2Router);
app.use('/check3', check3Router);
app.use('/create_key', createKeyRouter);
app.use('/admin', adminRouter);

// Main getkey route
app.get('/getkey', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API route for session management
app.post('/api/session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        const fingerprint = getBrowserFingerprint(req);
        
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        let session;
        
        // First priority: Check for existing session with same IP (regardless of browser)
        session = await sessionsCollection.findOne({ 
            ip: clientIP,
            $or: [
                { key: { $ne: null } }, // Has generated key
                { phase1: true }, // Or has started checkpoints
                { phase2: true },
                { phase3: true }
            ],
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Within 24 hours
        });
        
        // Second priority: Check by provided sessionId
        if (!session && sessionId) {
            session = await sessionsCollection.findOne({ sessionId });
        }
        
        // Third priority: Check for any session with same IP and fingerprint
        if (!session) {
            session = await sessionsCollection.findOne({ 
                ip: clientIP, 
                fingerprint: fingerprint,
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });
        }
        
        if (!session) {
            // Create new session only if no existing session found for this IP
            const newSessionId = generateSessionId();
            const newSession = {
                sessionId: newSessionId,
                ip: clientIP,
                fingerprint: fingerprint,
                phase1: false,
                phase2: false,
                phase3: false,
                key: null,
                createdAt: new Date(),
                lastActivity: new Date(),
                keyCreatedAt: null,
                keyExpiresAt: null
            };
            
            await sessionsCollection.insertOne(newSession);
            session = newSession;
        } else {
            // Update existing session with current browser fingerprint and activity
            await sessionsCollection.updateOne(
                { sessionId: session.sessionId },
                { 
                    $set: { 
                        lastActivity: new Date(),
                        fingerprint: fingerprint // Update fingerprint for current browser
                    }
                }
            );
        }
        
        res.json({ sessionId: session.sessionId, session });
        
    } catch (error) {
        console.error('Session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Root route redirect
app.get('/', (req, res) => {
    res.redirect('/getkey');
});

// Enhanced cleanup function with dynamic settings
async function cleanupExpiredSessions() {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        const settingsCollection = db.collection('settings');
        
        // Get current settings
        const settings = await settingsCollection.findOne({ _id: 'admin_settings' });
        const keyDeleteMinutes = settings?.autoDeleteKeyMinutes || 60;
        const sessionDeleteMinutes = settings?.autoDeleteSessionMinutes || 60;
        
        const now = new Date();
        
        // Delete sessions with expired keys (based on admin settings)
        const expiredKeySessions = await sessionsCollection.deleteMany({
            key: { $ne: null },
            keyExpiresAt: { $lt: new Date(now.getTime() - keyDeleteMinutes * 60 * 1000) }
        });
        
        // Delete sessions without keys that are older than configured time
        const sessionsWithoutKeys = await sessionsCollection.deleteMany({
            key: null,
            createdAt: { $lt: new Date(now.getTime() - sessionDeleteMinutes * 60 * 1000) }
        });
        
        if (expiredKeySessions.deletedCount > 0 || sessionsWithoutKeys.deletedCount > 0) {
            console.log(`Auto-cleanup completed: ${expiredKeySessions.deletedCount} expired key sessions, ${sessionsWithoutKeys.deletedCount} incomplete sessions removed`);
        }
        
    } catch (error) {
        console.error('Auto-cleanup error:', error);
    }
}

// Function to update key expiration times based on settings
async function updateKeyExpirationSettings() {
    try {
        const db = getDB();
        const settingsCollection = db.collection('settings');
        const settings = await settingsCollection.findOne({ _id: 'admin_settings' });
        
        if (settings && settings.keyExpirationHours) {
            global.KEY_EXPIRATION_HOURS = settings.keyExpirationHours;
        }
        
    } catch (error) {
        console.error('Settings update error:', error);
    }
}

// Get current key expiration setting
async function getKeyExpirationHours() {
    try {
        const db = getDB();
        const settingsCollection = db.collection('settings');
        const settings = await settingsCollection.findOne({ _id: 'admin_settings' });
        return settings?.keyExpirationHours || 24;
    } catch (error) {
        return 24; // Default fallback
    }
}

// Schedule cleanup based on settings (every 5 minutes to check settings)
cron.schedule('*/5 * * * *', () => {
    console.log('Running scheduled auto-cleanup...');
    cleanupExpiredSessions();
    updateKeyExpirationSettings();
});

// Additional scheduled job for more frequent cleanup (every minute for expired keys)
cron.schedule('* * * * *', async () => {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        // Quick cleanup of definitely expired keys (past their expiration time)
        const quickCleanup = await sessionsCollection.deleteMany({
            key: { $ne: null },
            keyExpiresAt: { $lt: new Date() }
        });
        
        if (quickCleanup.deletedCount > 0) {
            console.log(`Quick cleanup: ${quickCleanup.deletedCount} expired keys removed`);
        }
        
    } catch (error) {
        console.error('Quick cleanup error:', error);
    }
});

// Initialize database and start server
async function startServer() {
    try {
        await connectDB();
        
        // Initialize default settings if they don't exist
        const db = getDB();
        const settingsCollection = db.collection('settings');
        const existingSettings = await settingsCollection.findOne({ _id: 'admin_settings' });
        
        if (!existingSettings) {
            const defaultSettings = {
                _id: 'admin_settings',
                keyExpirationHours: 24,
                autoDeleteKeyMinutes: 60,
                autoDeleteSessionMinutes: 60,
                createdAt: new Date()
            };
            await settingsCollection.insertOne(defaultSettings);
            console.log('Default admin settings created');
        }
        
        // Run initial cleanup and settings update
        await cleanupExpiredSessions();
        await updateKeyExpirationSettings();
        
        app.listen(PORT, () => {
            console.log(`GetKey System server running on port ${PORT}`);
            console.log(`Visit http://localhost:${PORT}/getkey to start`);
            console.log(`Admin panel: http://localhost:${PORT}/admin/login`);
            console.log('Auto-cleanup scheduled every 5 minutes');
        });
        
    } catch (error) {
        console.error('Server startup error:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    process.exit(0);
});

// Export the getKeyExpirationHours function for use in other modules
module.exports = { getKeyExpirationHours };

startServer();