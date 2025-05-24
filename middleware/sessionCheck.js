// Middleware to check session and checkpoint progress
const sessionCheck = {
    // Initialize session checkpoint data
    initializeSession: (req, res, next) => {
        if (!req.session.checkpoint) {
            req.session.checkpoint = {
                current: 0,
                completed: [],
                startTime: new Date(),
                ipAddress: req.ip || req.connection.remoteAddress
            };
        }
        next();
    },

    // Check if user can access specific checkpoint
    canAccessCheckpoint: (checkpointNumber) => {
        return (req, res, next) => {
            const checkpoint = req.session.checkpoint;
            
            // Initialize session if not exists
            if (!checkpoint) {
                req.session.checkpoint = {
                    current: 0,
                    completed: [],
                    startTime: new Date(),
                    ipAddress: req.ip || req.connection.remoteAddress
                };
            }

            // Allow access to checkpoint 1 always
            if (checkpointNumber === 1) {
                return next();
            }

            // For checkpoint 2, must have completed checkpoint 1
            if (checkpointNumber === 2) {
                if (!req.session.checkpoint.completed.includes(1)) {
                    return res.redirect('/checkpoint/1');
                }
                return next();
            }

            // For checkpoint 3 (access), must have completed checkpoints 1 and 2
            if (checkpointNumber === 3) {
                if (!req.session.checkpoint.completed.includes(1) || 
                    !req.session.checkpoint.completed.includes(2)) {
                    return res.redirect('/checkpoint/1');
                }
                return next();
            }

            next();
        };
    },

    // Mark checkpoint as completed
    completeCheckpoint: (checkpointNumber) => {
        return (req, res, next) => {
            if (!req.session.checkpoint) {
                req.session.checkpoint = {
                    current: 0,
                    completed: [],
                    startTime: new Date(),
                    ipAddress: req.ip || req.connection.remoteAddress
                };
            }

            // Add to completed if not already there
            if (!req.session.checkpoint.completed.includes(checkpointNumber)) {
                req.session.checkpoint.completed.push(checkpointNumber);
            }

            req.session.checkpoint.current = Math.max(
                req.session.checkpoint.current, 
                checkpointNumber
            );

            next();
        };
    },

    // Check if coming from Linkvertise (basic validation)
    validateLinkvertiseReturn: (req, res, next) => {
        const referer = req.get('Referer');
        const userAgent = req.get('User-Agent');
        
        // Basic validation - you might want to add more sophisticated checks
        // This is a simple check, Linkvertise might have specific parameters
        
        // For now, we'll allow all returns and let Linkvertise script handle validation
        req.isFromLinkvertise = true;
        next();
    },

    // Check if session is valid and not expired
    validateSession: (req, res, next) => {
        if (!req.session.checkpoint) {
            return res.redirect('/checkpoint/1');
        }

        // Check if session is too old (optional additional check)
        const sessionAge = new Date() - new Date(req.session.checkpoint.startTime);
        const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours

        if (sessionAge > maxSessionAge) {
            req.session.destroy((err) => {
                if (err) console.error('Session destroy error:', err);
                return res.redirect('/checkpoint/1');
            });
            return;
        }

        next();
    },

    // Reset session (useful for testing or forced restart)
    resetSession: (req, res, next) => {
        req.session.checkpoint = {
            current: 0,
            completed: [],
            startTime: new Date(),
            ipAddress: req.ip || req.connection.remoteAddress
        };
        next();
    }
};

module.exports = sessionCheck;