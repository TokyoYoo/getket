// routes/admin.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db/connection');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '$2b$10$YourHashedPasswordHere';

// Middleware to check admin authentication
function authenticateAdmin(req, res, next) {
    const token = req.cookies.adminToken || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Admin login page
router.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin Login</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                .login-container { max-width: 400px; margin: 100px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h2 { text-align: center; margin-bottom: 30px; color: #333; }
                .form-group { margin-bottom: 20px; }
                label { display: block; margin-bottom: 5px; font-weight: bold; }
                input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
                button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
                button:hover { background: #0056b3; }
                .error { color: red; margin-top: 10px; text-align: center; }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h2>Admin Login</h2>
                <form id="loginForm">
                    <div class="form-group">
                        <label>Username:</label>
                        <input type="text" id="username" required>
                    </div>
                    <div class="form-group">
                        <label>Password:</label>
                        <input type="password" id="password" required>
                    </div>
                    <button type="submit">Login</button>
                    <div class="error" id="error"></div>
                </form>
            </div>
            
            <script>
                document.getElementById('loginForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const username = document.getElementById('username').value;
                    const password = document.getElementById('password').value;
                    
                    try {
                        const response = await fetch('/admin/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username, password })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            document.cookie = 'adminToken=' + data.token + '; path=/';
                            window.location.href = '/admin/dashboard';
                        } else {
                            document.getElementById('error').textContent = data.message;
                        }
                    } catch (error) {
                        document.getElementById('error').textContent = 'Login failed';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// Admin login POST
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (username !== ADMIN_USERNAME) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }
        
        const isValidPassword = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        if (!isValidPassword) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
        
        res.cookie('adminToken', token, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 
        });
        
        res.json({ success: true, token });
        
    } catch (error) {
        console.error('Login error:', error);
        res.json({ success: false, message: 'Login failed' });
    }
});

// Admin dashboard
router.get('/dashboard', authenticateAdmin, async (req, res) => {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        const settingsCollection = db.collection('settings');
        
        // Get current settings
        let settings = await settingsCollection.findOne({ _id: 'admin_settings' });
        if (!settings) {
            settings = {
                _id: 'admin_settings',
                keyExpirationHours: 24,
                autoDeleteKeyMinutes: 60,
                autoDeleteSessionMinutes: 60
            };
            await settingsCollection.insertOne(settings);
        }
        
        // Get statistics
        const totalSessions = await sessionsCollection.countDocuments();
        const sessionsWithKeys = await sessionsCollection.countDocuments({ key: { $ne: null } });
        const expiredKeys = await sessionsCollection.countDocuments({ 
            keyExpiresAt: { $lt: new Date() },
            key: { $ne: null }
        });
        const sessionsWithoutKeys = await sessionsCollection.countDocuments({ key: null });
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Dashboard</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                    .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .header h1 { margin: 0; color: #333; }
                    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
                    .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
                    .stat-number { font-size: 2em; font-weight: bold; color: #007bff; }
                    .stat-label { color: #666; margin-top: 5px; }
                    .settings-section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .settings-section h2 { margin-top: 0; color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
                    .form-group { margin-bottom: 15px; }
                    .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
                    .form-group input, .form-group select { padding: 8px; border: 1px solid #ddd; border-radius: 4px; width: 200px; }
                    .btn { padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
                    .btn-primary { background: #007bff; color: white; }
                    .btn-success { background: #28a745; color: white; }
                    .btn-warning { background: #ffc107; color: black; }
                    .btn-danger { background: #dc3545; color: white; }
                    .btn:hover { opacity: 0.8; }
                    .actions-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
                    .action-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .logout { float: right; }
                    .message { padding: 10px; margin: 10px 0; border-radius: 4px; }
                    .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                    .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>GetKey Admin Dashboard</h1>
                    <button class="btn btn-danger logout" onclick="logout()">Logout</button>
                </div>
                
                <div id="message"></div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-number">${totalSessions}</div>
                        <div class="stat-label">Total Sessions</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${sessionsWithKeys}</div>
                        <div class="stat-label">Sessions with Keys</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${expiredKeys}</div>
                        <div class="stat-label">Expired Keys</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${sessionsWithoutKeys}</div>
                        <div class="stat-label">Sessions without Keys</div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <h2>Settings</h2>
                    <form id="settingsForm">
                        <div class="form-group">
                            <label>Key Expiration (Hours):</label>
                            <input type="number" id="keyExpirationHours" value="${settings.keyExpirationHours}" min="1" max="168">
                        </div>
                        <div class="form-group">
                            <label>Auto Delete Expired Keys (Minutes):</label>
                            <input type="number" id="autoDeleteKeyMinutes" value="${settings.autoDeleteKeyMinutes}" min="1" max="1440">
                        </div>
                        <div class="form-group">
                            <label>Auto Delete Sessions without Keys (Minutes):</label>
                            <input type="number" id="autoDeleteSessionMinutes" value="${settings.autoDeleteSessionMinutes}" min="1" max="1440">
                        </div>
                        <button type="submit" class="btn btn-primary">Save Settings</button>
                    </form>
                </div>
                
                <div class="actions-section">
                    <div class="action-card">
                        <h3>Key Management</h3>
                        <button class="btn btn-warning" onclick="expireAllKeys()">Expire All Keys Now</button>
                        <button class="btn btn-danger" onclick="deleteExpiredKeys()">Delete Expired Keys</button>
                        <button class="btn btn-success" onclick="extendAllKeys()">Extend All Keys (+24h)</button>
                    </div>
                    
                    <div class="action-card">
                        <h3>Session Management</h3>
                        <button class="btn btn-warning" onclick="deleteSessionsWithoutKeys()">Delete Sessions without Keys</button>
                        <button class="btn btn-danger" onclick="deleteAllSessions()">Delete All Sessions</button>
                        <button class="btn btn-success" onclick="refreshStats()">Refresh Statistics</button>
                    </div>
                    
                    <div class="action-card">
                        <h3>Cleanup Actions</h3>
                        <button class="btn btn-primary" onclick="runCleanup()">Run Manual Cleanup</button>
                        <button class="btn btn-success" onclick="resetAllPhases()">Reset All Phases</button>
                    </div>
                </div>
                
                <script>
                    async function apiCall(url, method = 'GET', data = null) {
                        const options = {
                            method,
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + getCookie('adminToken')
                            }
                        };
                        
                        if (data) {
                            options.body = JSON.stringify(data);
                        }
                        
                        const response = await fetch(url, options);
                        return await response.json();
                    }
                    
                    function getCookie(name) {
                        const value = "; " + document.cookie;
                        const parts = value.split("; " + name + "=");
                        if (parts.length == 2) return parts.pop().split(";").shift();
                    }
                    
                    function showMessage(message, type = 'success') {
                        const messageDiv = document.getElementById('message');
                        messageDiv.innerHTML = '<div class="message ' + type + '">' + message + '</div>';
                        setTimeout(() => messageDiv.innerHTML = '', 5000);
                    }
                    
                    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const settings = {
                            keyExpirationHours: parseInt(document.getElementById('keyExpirationHours').value),
                            autoDeleteKeyMinutes: parseInt(document.getElementById('autoDeleteKeyMinutes').value),
                            autoDeleteSessionMinutes: parseInt(document.getElementById('autoDeleteSessionMinutes').value)
                        };
                        
                        const result = await apiCall('/admin/settings', 'POST', settings);
                        showMessage(result.message, result.success ? 'success' : 'error');
                    });
                    
                    async function expireAllKeys() {
                        if (confirm('Are you sure you want to expire all keys?')) {
                            const result = await apiCall('/admin/expire-keys', 'POST');
                            showMessage(result.message, result.success ? 'success' : 'error');
                            setTimeout(() => location.reload(), 2000);
                        }
                    }
                    
                    async function deleteExpiredKeys() {
                        if (confirm('Delete all expired keys?')) {
                            const result = await apiCall('/admin/delete-expired-keys', 'POST');
                            showMessage(result.message, result.success ? 'success' : 'error');
                            setTimeout(() => location.reload(), 2000);
                        }
                    }
                    
                    async function extendAllKeys() {
                        if (confirm('Extend all keys by 24 hours?')) {
                            const result = await apiCall('/admin/extend-keys', 'POST');
                            showMessage(result.message, result.success ? 'success' : 'error');
                            setTimeout(() => location.reload(), 2000);
                        }
                    }
                    
                    async function deleteSessionsWithoutKeys() {
                        if (confirm('Delete all sessions without keys?')) {
                            const result = await apiCall('/admin/delete-sessions-without-keys', 'POST');
                            showMessage(result.message, result.success ? 'success' : 'error');
                            setTimeout(() => location.reload(), 2000);
                        }
                    }
                    
                    async function deleteAllSessions() {
                        if (confirm('WARNING: This will delete ALL sessions and keys! Are you sure?')) {
                            const result = await apiCall('/admin/delete-all-sessions', 'POST');
                            showMessage(result.message, result.success ? 'success' : 'error');
                            setTimeout(() => location.reload(), 2000);
                        }
                    }
                    
                    async function runCleanup() {
                        const result = await apiCall('/admin/cleanup', 'POST');
                        showMessage(result.message, result.success ? 'success' : 'error');
                        setTimeout(() => location.reload(), 2000);
                    }
                    
                    async function resetAllPhases() {
                        if (confirm('Reset all checkpoint phases for all sessions?')) {
                            const result = await apiCall('/admin/reset-phases', 'POST');
                            showMessage(result.message, result.success ? 'success' : 'error');
                            setTimeout(() => location.reload(), 2000);
                        }
                    }
                    
                    function refreshStats() {
                        location.reload();
                    }
                    
                    function logout() {
                        document.cookie = 'adminToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                        window.location.href = '/admin/login';
                    }
                    
                    // Auto refresh every 30 seconds
                    setInterval(refreshStats, 30000);
                </script>
            </body>
            </html>
        `);
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Save settings
router.post('/settings', authenticateAdmin, async (req, res) => {
    try {
        const { keyExpirationHours, autoDeleteKeyMinutes, autoDeleteSessionMinutes } = req.body;
        
        const db = getDB();
        const settingsCollection = db.collection('settings');
        
        await settingsCollection.updateOne(
            { _id: 'admin_settings' },
            { 
                $set: { 
                    keyExpirationHours: parseInt(keyExpirationHours),
                    autoDeleteKeyMinutes: parseInt(autoDeleteKeyMinutes),
                    autoDeleteSessionMinutes: parseInt(autoDeleteSessionMinutes),
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );
        
        res.json({ success: true, message: 'Settings saved successfully' });
        
    } catch (error) {
        console.error('Settings error:', error);
        res.json({ success: false, message: 'Failed to save settings' });
    }
});

// Expire all keys
router.post('/expire-keys', authenticateAdmin, async (req, res) => {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        const result = await sessionsCollection.updateMany(
            { key: { $ne: null } },
            { $set: { keyExpiresAt: new Date() } }
        );
        
        res.json({ 
            success: true, 
            message: `${result.modifiedCount} keys expired successfully` 
        });
        
    } catch (error) {
        console.error('Expire keys error:', error);
        res.json({ success: false, message: 'Failed to expire keys' });
    }
});

// Delete expired keys
router.post('/delete-expired-keys', authenticateAdmin, async (req, res) => {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        const result = await sessionsCollection.deleteMany({
            key: { $ne: null },
            keyExpiresAt: { $lt: new Date() }
        });
        
        res.json({ 
            success: true, 
            message: `${result.deletedCount} expired sessions deleted` 
        });
        
    } catch (error) {
        console.error('Delete expired keys error:', error);
        res.json({ success: false, message: 'Failed to delete expired keys' });
    }
});

// Extend all keys
router.post('/extend-keys', authenticateAdmin, async (req, res) => {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        const result = await sessionsCollection.updateMany(
            { key: { $ne: null } },
            { $inc: { keyExpiresAt: 24 * 60 * 60 * 1000 } } // Add 24 hours
        );
        
        res.json({ 
            success: true, 
            message: `${result.modifiedCount} keys extended by 24 hours` 
        });
        
    } catch (error) {
        console.error('Extend keys error:', error);
        res.json({ success: false, message: 'Failed to extend keys' });
    }
});

// Delete sessions without keys
router.post('/delete-sessions-without-keys', authenticateAdmin, async (req, res) => {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        const result = await sessionsCollection.deleteMany({ key: null });
        
        res.json({ 
            success: true, 
            message: `${result.deletedCount} sessions without keys deleted` 
        });
        
    } catch (error) {
        console.error('Delete sessions error:', error);
        res.json({ success: false, message: 'Failed to delete sessions' });
    }
});

// Delete all sessions
router.post('/delete-all-sessions', authenticateAdmin, async (req, res) => {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        const result = await sessionsCollection.deleteMany({});
        
        res.json({ 
            success: true, 
            message: `All ${result.deletedCount} sessions deleted` 
        });
        
    } catch (error) {
        console.error('Delete all sessions error:', error);
        res.json({ success: false, message: 'Failed to delete all sessions' });
    }
});

// Manual cleanup
router.post('/cleanup', authenticateAdmin, async (req, res) => {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        const settingsCollection = db.collection('settings');
        
        // Get settings
        const settings = await settingsCollection.findOne({ _id: 'admin_settings' });
        const keyDeleteMinutes = settings?.autoDeleteKeyMinutes || 60;
        const sessionDeleteMinutes = settings?.autoDeleteSessionMinutes || 60;
        
        const now = new Date();
        
        // Delete expired keys
        const expiredKeys = await sessionsCollection.deleteMany({
            key: { $ne: null },
            keyExpiresAt: { $lt: new Date(now.getTime() - keyDeleteMinutes * 60 * 1000) }
        });
        
        // Delete old sessions without keys
        const oldSessions = await sessionsCollection.deleteMany({
            key: null,
            createdAt: { $lt: new Date(now.getTime() - sessionDeleteMinutes * 60 * 1000) }
        });
        
        res.json({ 
            success: true, 
            message: `Cleanup completed: ${expiredKeys.deletedCount} expired keys, ${oldSessions.deletedCount} old sessions deleted` 
        });
        
    } catch (error) {
        console.error('Cleanup error:', error);
        res.json({ success: false, message: 'Cleanup failed' });
    }
});

// Reset all phases
router.post('/reset-phases', authenticateAdmin, async (req, res) => {
    try {
        const db = getDB();
        const sessionsCollection = db.collection('sessions');
        
        const result = await sessionsCollection.updateMany(
            {},
            { 
                $set: { 
                    phase1: false, 
                    phase2: false, 
                    phase3: false 
                } 
            }
        );
        
        res.json({ 
            success: true, 
            message: `${result.modifiedCount} sessions phases reset` 
        });
        
    } catch (error) {
        console.error('Reset phases error:', error);
        res.json({ success: false, message: 'Failed to reset phases' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('adminToken');
    res.json({ success: true });
});

module.exports = router;