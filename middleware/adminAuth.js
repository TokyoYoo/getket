const bcrypt = require('bcryptjs');

// Simple admin authentication middleware
// In production, use proper user management system
const adminAuth = {
    // Admin credentials (in production, store in database with proper hashing)
    adminCredentials: {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123' // Change this in production!
    },

    // Middleware to check if user is authenticated as admin
    requireAuth: (req, res, next) => {
        if (!req.session.isAdmin) {
            return res.redirect('/dashboard/login');
        }
        next();
    },

    // Login page handler
    loginPage: (req, res) => {
        if (req.session.isAdmin) {
            return res.redirect('/dashboard');
        }
        res.render('admin-login', { 
            title: 'Admin Login',
            error: req.query.error 
        });
    },

    // Login handler
    login: async (req, res) => {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.redirect('/dashboard/login?error=missing_credentials');
            }

            // Simple credential check (in production, use proper authentication)
            if (username === adminAuth.adminCredentials.username && 
                password === adminAuth.adminCredentials.password) {
                
                req.session.isAdmin = true;
                req.session.adminLoginTime = new Date();
                
                req.session.save((err) => {
                    if (err) {
                        console.error('Session save error:', err);
                        return res.redirect('/dashboard/login?error=session_error');
                    }
                    res.redirect('/dashboard');
                });
            } else {
                res.redirect('/dashboard/login?error=invalid_credentials');
            }
        } catch (error) {
            console.error('Login error:', error);
            res.redirect('/dashboard/login?error=server_error');
        }
    },

    // Logout handler
    logout: (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
            }
            res.redirect('/dashboard/login');
        });
    },

    // Check if current user is admin (for API endpoints)
    isAdmin: (req, res, next) => {
        if (!req.session.isAdmin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    }
};

module.exports = adminAuth;