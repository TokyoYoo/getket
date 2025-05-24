const bcrypt = require('bcryptjs');

const adminAuth = {
    // Check if user is authenticated as admin
    requireAuth: (req, res, next) => {
        if (req.session.adminAuthenticated) {
            return next();
        }
        
        // Store the original URL to redirect after login
        req.session.returnTo = req.originalUrl;
        res.redirect('/dashboard/login');
    },

    // Authenticate admin credentials
    authenticate: async (req, res, next) => {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.render('dashboard/login', { 
                error: 'Username and password are required',
                title: 'Admin Login'
            });
        }

        // Simple authentication - in production, use proper user management
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

        try {
            // For development - plain text comparison
            // In production, hash the admin password and use bcrypt.compare
            if (username === adminUsername && password === adminPassword) {
                req.session.adminAuthenticated = true;
                req.session.adminUsername = username;
                
                // Redirect to original URL or dashboard
                const returnTo = req.session.returnTo || '/dashboard';
                delete req.session.returnTo;
                
                return res.redirect(returnTo);
            } else {
                return res.render('dashboard/login', { 
                    error: 'Invalid username or password',
                    title: 'Admin Login'
                });
            }
        } catch (error) {
            console.error('Authentication error:', error);
            return res.render('dashboard/login', { 
                error: 'Authentication failed',
                title: 'Admin Login'
            });
        }
    },

    // Logout admin
    logout: (req, res, next) => {
        req.session.adminAuthenticated = false;
        delete req.session.adminUsername;
        
        // Optionally destroy the entire session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
            }
            res.redirect('/dashboard/login');
        });
    },

    // Check if admin is logged in (for conditional rendering)
    checkAuth: (req, res, next) => {
        res.locals.adminAuthenticated = req.session.adminAuthenticated || false;
        res.locals.adminUsername = req.session.adminUsername || null;
        next();
    },

    // Generate hashed password (utility function for setup)
    hashPassword: async (password) => {
        try {
            const saltRounds = 12;
            return await bcrypt.hash(password, saltRounds);
        } catch (error) {
            throw new Error('Password hashing failed');
        }
    },

    // Verify password against hash
    verifyPassword: async (password, hash) => {
        try {
            return await bcrypt.compare(password, hash);
        } catch (error) {
            return false;
        }
    }
};

module.exports = adminAuth;