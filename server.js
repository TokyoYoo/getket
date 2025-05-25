const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { connectDB, getDB } = require('./db/connection');
const { generateSessionId, getBrowserFingerprint } = require('./utils/generateKey');

// Import routes
const check1Router = require('./routes/check1');
const check2Router = require('./routes/check2');
const check3Router = require('./routes/check3');
const createKeyRouter = require('./routes/create_key');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Routes
app.use('/check1', check1Router);
app.use('/check2', check2Router);
app.use('/check3', check3Router);
app.use('/create_key', createKeyRouter);

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

// Cleanup functions
async function cleanupExpiredSessions() {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        const now = new Date();
        
        // Delete sessions without keys that are older than 1 hour
        const sessionsWithoutKeys = await sessionsCollection.deleteMany({
            key: null,
            createdAt: { $lt: new Date(now.getTime() - 60 * 60 * 1000) }
        });
        
        // Delete sessions with expired keys (older than 24 hours)
        const sessionsWithExpiredKeys = await sessionsCollection.deleteMany({
            key: { $ne: null },
            keyExpiresAt: { $lt: now }
        });
        
        if (sessionsWithoutKeys.deletedCount > 0 || sessionsWithExpiredKeys.deletedCount > 0) {
            console.log(`Cleanup completed: ${sessionsWithoutKeys.deletedCount} incomplete sessions, ${sessionsWithExpiredKeys.deletedCount} expired sessions removed`);
        }
        
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Schedule cleanup every hour
cron.schedule('0 * * * *', () => {
    console.log('Running scheduled cleanup...');
    cleanupExpiredSessions();
});

// Initialize database and start server
async function startServer() {
    try {
        await connectDB();
        
        // Run initial cleanup
        await cleanupExpiredSessions();
        
        app.listen(PORT, () => {
            console.log(`GetKey System server running on port ${PORT}`);
            console.log(`Visit http://localhost:${PORT}/getkey to start`);
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

startServer();