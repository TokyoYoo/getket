require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { MongoClient, ObjectId } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
let db;
const client = new MongoClient(process.env.MONGODB_URI);

// Connect to MongoDB
async function connectDB() {
    try {
        await client.connect();
        db = client.db('roblox_getkey');
        console.log('Connected to MongoDB');
        
        // Initialize collections
        await initializeCollections();
        
        // Start cleanup task
        startCleanupTask();
        
        // Start webhook task
        startWebhookTask();
    } catch (error) {
        console.error('MongoDB connection failed:', error);
        process.exit(1);
    }
}

// Initialize collections and default settings
async function initializeCollections() {
    const settingsCollection = db.collection('settings');
    const existingSettings = await settingsCollection.findOne({});
    
    if (!existingSettings) {
        await settingsCollection.insertOne({
            keyExpireHours: parseInt(process.env.DEFAULT_KEY_EXPIRE_HOURS) || 24,
            linkvertiseId1: process.env.DEFAULT_LINKVERTISE_ID_1 || '572754',
            linkvertiseId2: process.env.DEFAULT_LINKVERTISE_ID_2 || '572754',
            linkvertiseId3: process.env.DEFAULT_LINKVERTISE_ID_3 || '572754',
            webhookUrl: process.env.DEFAULT_WEBHOOK_URL || '',
            webhookInterval: parseInt(process.env.DEFAULT_WEBHOOK_INTERVAL) || 60
        });
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', __dirname);

// Helper functions
function getClientIP(req) {
    return req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
}

async function getSettings() {
    const settingsCollection = db.collection('settings');
    return await settingsCollection.findOne({}) || {};
}

async function createOrGetToken(ip) {
    const tokensCollection = db.collection('tokens');
    
    // Find existing token for this IP
    let token = await tokensCollection.findOne({ ip: ip });
    
    if (!token) {
        // Create new token
        const tokenId = uuidv4();
        token = {
            _id: tokenId,
            ip: ip,
            stage: 0,
            keyId: null,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        };
        await tokensCollection.insertOne(token);
    }
    
    return token._id;
}

async function getTokenData(tokenId) {
    const tokensCollection = db.collection('tokens');
    return await tokensCollection.findOne({ _id: tokenId });
}

async function updateTokenStage(tokenId, stage, keyId = null) {
    const tokensCollection = db.collection('tokens');
    const updateData = { stage: stage };
    if (keyId) updateData.keyId = keyId;
    
    await tokensCollection.updateOne(
        { _id: tokenId },
        { $set: updateData }
    );
}

// Helper function to check if request is from Linkvertise
function isFromLinkvertise(referrer) {
    return referrer.includes('linkvertise.com') || 
           referrer.includes('link-to.net') || 
           referrer.includes('direct-link.net') ||
           referrer.includes('linkvertise') ||
           referrer.includes('lv-cdn.com') ||
           referrer.includes('publisher.linkvertise.com');
}

// Routes

// Home page
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Roblox GetKey System',
        message: 'Welcome to Roblox GetKey System'
    });
});

// Main checkpoint route - แสดงหน้า checkpoint เท่านั้น (ไม่อัพเดท stage ที่นี่)
app.get('/checkpoint/:stage', async (req, res) => {
    const stage = parseInt(req.params.stage);
    const ip = getClientIP(req);
    const referrer = req.get('Referrer') || req.get('Referer') || '';
    
    // Validate stage range
    if (stage < 1 || stage > 3) {
        return res.redirect('/checkpoint/1');
    }
    
    try {
        const tokenId = await createOrGetToken(ip);
        const tokenData = await getTokenData(tokenId);
        const settings = await getSettings();
        
        console.log(`Checkpoint ${stage} - IP: ${ip}, Current Stage: ${tokenData.stage}, Referrer: ${referrer}`);
        
        // If user already completed all stages, go to access
        if (tokenData.stage >= 3) {
            return res.redirect('/access');
        }
        
        // If user is trying to access a stage they haven't reached yet
        if (stage > tokenData.stage + 1) {
            console.log(`User trying to skip to stage ${stage}, redirecting to stage ${tokenData.stage + 1}`);
            return res.redirect(`/checkpoint/${tokenData.stage + 1}`);
        }
        
        // If user already completed this stage, redirect to next
        if (tokenData.stage >= stage) {
            console.log(`User already completed stage ${stage}, redirecting to stage ${tokenData.stage + 1}`);
            return res.redirect(`/checkpoint/${tokenData.stage + 1}`);
        }
        
        const linkvertiseIds = [
            settings.linkvertiseId1,
            settings.linkvertiseId2,
            settings.linkvertiseId3
        ];
        
        // Create completion URL that will be used by Linkvertise
        const completionUrl = `${req.protocol}://${req.get('host')}/checkpoint/${stage}/complete`;
        
        // แสดงหน้า checkpoint
        res.render('checkpoint', {
            title: `Checkpoint ${stage}`,
            stage: stage,
            linkvertiseId: linkvertiseIds[stage - 1],
            nextUrl: completionUrl,
            tokenId: tokenId,
            currentStage: tokenData.stage
        });
        
    } catch (error) {
        console.error('Checkpoint error:', error);
        res.status(500).send('Server error');
    }
});

// Completion route for Linkvertise returns - ทำการอัพเดท stage ที่นี่
app.get('/checkpoint/:stage/complete', async (req, res) => {
    const stage = parseInt(req.params.stage);
    const ip = getClientIP(req);
    const referrer = req.get('Referrer') || req.get('Referer') || '';
    
    console.log(`Completion route - Stage: ${stage}, IP: ${ip}, Referrer: ${referrer}`);
    
    try {
        const tokenId = await createOrGetToken(ip);
        let tokenData = await getTokenData(tokenId);
        
        // Check if coming from Linkvertise
        const isFromLinkvertiseCheck = isFromLinkvertise(referrer) || req.query.completed === 'true'; // Parameter สำรอง
        
        console.log(`Completion - Current stage: ${tokenData.stage}, Completing stage: ${stage}, From Linkvertise: ${isFromLinkvertiseCheck}`);
        
        // Update stage only when following sequence (current stage + 1) and from Linkvertise
        if (isFromLinkvertiseCheck && tokenData.stage === stage - 1) {
            console.log(`✅ Completing stage ${stage} - updating from ${tokenData.stage} to ${stage}`);
            await updateTokenStage(tokenId, stage);
            
            // Wait a moment for database update
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // แสดงหน้าสำเร็จก่อน แล้วค่อย redirect
            if (stage >= 3) {
                // ถ้าจบ stage 3 แล้ว ไปหน้า access
                console.log(`🎉 All stages completed! Redirecting to access page`);
                return res.redirect('/access');
            } else {
                // ถ้ายังไม่จบ แสดงหน้าสำเร็จแล้วให้ไป stage ถัดไป
                console.log(`✅ Stage ${stage} completed! Showing success page then redirect to stage ${stage + 1}`);
                
                // แสดงหน้าสำเร็จสักครู่ แล้วค่อย redirect
                res.send(`
                    <html>
                    <head>
                        <title>Stage ${stage} Completed!</title>
                        <meta http-equiv="refresh" content="3;url=/checkpoint/${stage + 1}">
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f0f0; }
                            .success { background: #4CAF50; color: white; padding: 20px; border-radius: 10px; display: inline-block; }
                            .loading { margin-top: 20px; }
                        </style>
                    </head>
                    <body>
                        <div class="success">
                            <h1>✅ Stage ${stage} Completed!</h1>
                            <p>Great job! You've successfully completed checkpoint ${stage}.</p>
                            <p>Redirecting to Stage ${stage + 1} in 3 seconds...</p>
                        </div>
                        <div class="loading">
                            <p>If you're not redirected automatically, <a href="/checkpoint/${stage + 1}">click here</a>.</p>
                        </div>
                        <script>
                            setTimeout(function() {
                                window.location.href = '/checkpoint/${stage + 1}';
                            }, 3000);
                        </script>
                    </body>
                    </html>
                `);
                return;
            }
        }
        
        // If already completed this stage or higher
        if (tokenData.stage >= stage) {
            if (tokenData.stage >= 3) {
                return res.redirect('/access');
            } else {
                return res.redirect(`/checkpoint/${tokenData.stage + 1}`);
            }
        }
        
        // If trying to skip stages
        if (tokenData.stage < stage - 1) {
            console.log(`❌ Invalid stage progression: trying stage ${stage} but current is ${tokenData.stage}`);
            return res.redirect(`/checkpoint/${tokenData.stage + 1}`);
        }
        
        // If not from Linkvertise, show error and redirect back
        console.log(`❌ Not from Linkvertise or invalid completion`);
        res.send(`
            <html>
            <head>
                <title>Invalid Access</title>
                <meta http-equiv="refresh" content="3;url=/checkpoint/${stage}">
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f0f0; }
                    .error { background: #f44336; color: white; padding: 20px; border-radius: 10px; display: inline-block; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h1>❌ Invalid Access</h1>
                    <p>You must complete the Linkvertise link to proceed.</p>
                    <p>Redirecting back to checkpoint ${stage}...</p>
                </div>
                <script>
                    setTimeout(function() {
                        window.location.href = '/checkpoint/${stage}';
                    }, 3000);
                </script>
            </body>
            </html>
        `);
        
    } catch (error) {
        console.error('Checkpoint complete error:', error);
        res.status(500).send('Server error');
    }
});

// API endpoint for manual checkpoint completion - SEQUENTIAL ONLY
app.post('/api/complete-checkpoint', async (req, res) => {
    const { stage, tokenId } = req.body;
    const referrer = req.get('Referrer') || req.get('Referer') || '';
    const ip = getClientIP(req);
    
    console.log(`API Complete - Stage: ${stage}, TokenId: ${tokenId}, IP: ${ip}, Referrer: ${referrer}`);
    
    try {
        const tokenData = await getTokenData(tokenId);
        if (!tokenData) {
            return res.json({ success: false, message: 'Invalid token' });
        }
        
        const stageNum = parseInt(stage);
        
        // Check if coming from Linkvertise
        const isFromLinkvertiseCheck = isFromLinkvertise(referrer);
        
        // Allow stage change only in sequence: current stage + 1 only
        const isValidProgression = stageNum === tokenData.stage + 1;
        
        if (isValidProgression && isFromLinkvertiseCheck) {
            // Update stage to next stage
            await updateTokenStage(tokenId, stageNum);
            console.log(`Stage updated from ${tokenData.stage} to ${stageNum}`);
            
            const nextUrl = stageNum >= 3 ? '/access' : `/checkpoint/${stageNum + 1}`;
            
            res.json({ 
                success: true, 
                newStage: stageNum,
                nextUrl: nextUrl
            });
        } else {
            res.json({ 
                success: false, 
                message: `Invalid stage progression. Current: ${tokenData.stage}, Requested: ${stageNum}`,
                currentStage: tokenData.stage,
                nextValidStage: tokenData.stage + 1,
                reason: !isValidProgression ? 'Not sequential' : 'Not from Linkvertise'
            });
        }
        
    } catch (error) {
        console.error('Complete checkpoint error:', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// Access page - Fixed to ensure all 3 stages are completed
app.get('/access', async (req, res) => {
    const ip = getClientIP(req);
    
    try {
        const tokenId = await createOrGetToken(ip);
        const tokenData = await getTokenData(tokenId);
        
        console.log(`Access page - IP: ${ip}, Current Stage: ${tokenData.stage}`);
        
        // Check that all 3 stages are completed
        if (tokenData.stage < 3) {
            console.log(`Access denied - stage ${tokenData.stage} < 3, redirecting to checkpoint ${tokenData.stage + 1}`);
            return res.redirect(`/checkpoint/${tokenData.stage + 1}`);
        }
        
        // Check if there's an existing valid key
        if (tokenData.keyId) {
            const keysCollection = db.collection('keys');
            const existingKey = await keysCollection.findOne({ 
                _id: tokenData.keyId,
                expiresAt: { $gt: new Date() }
            });
            
            if (existingKey) {
                return res.render('access', {
                    title: 'Your Key',
                    key: existingKey.key,
                    expiresAt: existingKey.expiresAt
                });
            }
        }
        
        // Create new key
        const settings = await getSettings();
        const keyExpireTime = settings.keyExpireHours || 24;
        const newKey = uuidv4();
        const keyId = new ObjectId();
        
        const keysCollection = db.collection('keys');
        await keysCollection.insertOne({
            _id: keyId,
            key: newKey,
            ip: ip,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + keyExpireTime * 60 * 60 * 1000)
        });
        
        // Update token with keyId
        await updateTokenStage(tokenId, 3, keyId);
        
        res.render('access', {
            title: 'Your Key',
            key: newKey,
            expiresAt: new Date(Date.now() + keyExpireTime * 60 * 60 * 1000)
        });
        
    } catch (error) {
        console.error('Access error:', error);
        res.status(500).send('Server error');
    }
});

// API Routes

// Validate key for Lua script
app.get('/api/validate-key', async (req, res) => {
    const { key } = req.query;
    
    if (!key) {
        return res.json({ valid: false, message: 'Key parameter required' });
    }
    
    try {
        const keysCollection = db.collection('keys');
        const keyData = await keysCollection.findOne({
            key: key,
            expiresAt: { $gt: new Date() }
        });
        
        if (keyData) {
            res.json({ valid: true, message: 'Key is valid', expiresAt: keyData.expiresAt });
        } else {
            res.json({ valid: false, message: 'Key is invalid or expired' });
        }
    } catch (error) {
        console.error('Validate key error:', error);
        res.json({ valid: false, message: 'Server error' });
    }
});

// Admin routes
app.get('/admin', (req, res) => {
    if (!req.session.adminLoggedIn) {
        return res.render('admin-login', { title: 'Admin Login', error: null });
    }
    res.redirect('/admin/dashboard');
});

app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        req.session.adminLoggedIn = true;
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin-login', { title: 'Admin Login', error: 'Invalid credentials' });
    }
});

app.get('/admin/dashboard', async (req, res) => {
    if (!req.session.adminLoggedIn) {
        return res.redirect('/admin');
    }
    
    try {
        const keysCollection = db.collection('keys');
        const totalKeys = await keysCollection.countDocuments({});
        const activeKeys = await keysCollection.countDocuments({
            expiresAt: { $gt: new Date() }
        });
        
        const settings = await getSettings();
        
        res.render('admin-dashboard', {
            title: 'Admin Dashboard',
            totalKeys,
            activeKeys,
            settings
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Server error');
    }
});

app.post('/admin/settings', async (req, res) => {
    if (!req.session.adminLoggedIn) {
        return res.redirect('/admin');
    }
    
    try {
        const {
            keyExpireHours,
            linkvertiseId1,
            linkvertiseId2,
            linkvertiseId3,
            webhookUrl,
            webhookInterval
        } = req.body;
        
        const settingsCollection = db.collection('settings');
        await settingsCollection.updateOne(
            {},
            {
                $set: {
                    keyExpireHours: parseInt(keyExpireHours) || 24,
                    linkvertiseId1: linkvertiseId1 || '572754',
                    linkvertiseId2: linkvertiseId2 || '572754',
                    linkvertiseId3: linkvertiseId3 || '572754',
                    webhookUrl: webhookUrl || '',
                    webhookInterval: parseInt(webhookInterval) || 60
                }
            },
            { upsert: true }
        );
        
        res.redirect('/admin/dashboard?success=Settings updated successfully');
    } catch (error) {
        console.error('Settings update error:', error);
        res.redirect('/admin/dashboard?error=Failed to update settings');
    }
});

app.get('/admin/keys', async (req, res) => {
    if (!req.session.adminLoggedIn) {
        return res.redirect('/admin');
    }
    
    try {
        const keysCollection = db.collection('keys');
        const keys = await keysCollection.find({}).sort({ createdAt: -1 }).limit(100).toArray();
        
        res.render('admin-keys', {
            title: 'Key Management',
            keys
        });
    } catch (error) {
        console.error('Keys page error:', error);
        res.status(500).send('Server error');
    }
});

app.post('/admin/delete-key', async (req, res) => {
    if (!req.session.adminLoggedIn) {
        return res.json({ success: false });
    }
    
    try {
        const { keyId } = req.body;
        const keysCollection = db.collection('keys');
        await keysCollection.deleteOne({ _id: new ObjectId(keyId) });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete key error:', error);
        res.json({ success: false });
    }
});

app.post('/admin/test-webhook', async (req, res) => {
    if (!req.session.adminLoggedIn) {
        return res.json({ success: false });
    }
    
    try {
        const settings = await getSettings();
        if (!settings.webhookUrl) {
            return res.json({ success: false, message: 'No webhook URL configured' });
        }
        
        const keysCollection = db.collection('keys');
        const totalKeys = await keysCollection.countDocuments({});
        const activeKeys = await keysCollection.countDocuments({
            expiresAt: { $gt: new Date() }
        });
        
        const webhookData = {
            totalKeys,
            activeKeys,
            timestamp: new Date().toISOString(),
            message: 'Test webhook from admin panel'
        };
        
        await axios.post(settings.webhookUrl, webhookData);
        res.json({ success: true, message: 'Webhook sent successfully' });
    } catch (error) {
        console.error('Test webhook error:', error);
        res.json({ success: false, message: 'Failed to send webhook' });
    }
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin');
});

// Cleanup expired keys and tokens
async function cleanupExpired() {
    try {
        const keysCollection = db.collection('keys');
        const tokensCollection = db.collection('tokens');
        
        await keysCollection.deleteMany({
            expiresAt: { $lt: new Date() }
        });
        
        await tokensCollection.deleteMany({
            expiresAt: { $lt: new Date() }
        });
        
        console.log('Cleanup completed');
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Start cleanup task
function startCleanupTask() {
    setInterval(cleanupExpired, 60 * 60 * 1000); // Run every hour
}

// Send webhook data
async function sendWebhookData() {
    try {
        const settings = await getSettings();
        if (!settings.webhookUrl) return;
        
        const keysCollection = db.collection('keys');
        const totalKeys = await keysCollection.countDocuments({});
        const activeKeys = await keysCollection.countDocuments({
            expiresAt: { $gt: new Date() }
        });
        
        const webhookData = {
            totalKeys,
            activeKeys,
            timestamp: new Date().toISOString()
        };
        
        await axios.post(settings.webhookUrl, webhookData);
        console.log('Webhook data sent');
    } catch (error) {
        console.error('Webhook error:', error);
    }
}

// Start webhook task
function startWebhookTask() {
    const sendInitialWebhook = async () => {
        const settings = await getSettings();
        const interval = (settings.webhookInterval || 60) * 60 * 1000; // Convert minutes to milliseconds
        
        setInterval(sendWebhookData, interval);
    };
    
    sendInitialWebhook();
}

// Start server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await client.close();
    process.exit(0);
});