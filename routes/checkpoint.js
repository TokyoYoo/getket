const express = require('express');
const router = express.Router();
const sessionCheck = require('../middleware/sessionCheck');

// Initialize session for all checkpoint routes
router.use(sessionCheck.initializeSession);

// Checkpoint 1 - Entry point
router.get('/1', sessionCheck.canAccessCheckpoint(1), (req, res) => {
    const checkpointData = {
        checkpointNumber: 1,
        title: 'Checkpoint 1',
        description: 'Complete the first step to continue',
        nextUrl: '/checkpoint/1/complete',
        isCompleted: req.session.checkpoint.completed.includes(1),
        canProceed: req.session.checkpoint.completed.includes(1)
    };

    res.render('checkpoint', {
        ...checkpointData,
        session: req.session.checkpoint
    });
});

// Checkpoint 1 completion (triggered by Linkvertise redirect)
router.get('/1/complete', sessionCheck.validateLinkvertiseReturn, 
    sessionCheck.completeCheckpoint(1), (req, res) => {
    // Redirect to checkpoint 2 after successful completion
    res.redirect('/checkpoint/2');
});

// Checkpoint 2
router.get('/2', sessionCheck.canAccessCheckpoint(2), (req, res) => {
    const checkpointData = {
        checkpointNumber: 2,
        title: 'Checkpoint 2',
        description: 'Complete the second step to continue',
        nextUrl: '/checkpoint/2/complete',
        isCompleted: req.session.checkpoint.completed.includes(2),
        canProceed: req.session.checkpoint.completed.includes(2)
    };

    res.render('checkpoint', {
        ...checkpointData,
        session: req.session.checkpoint
    });
});

// Checkpoint 2 completion
router.get('/2/complete', sessionCheck.validateLinkvertiseReturn, 
    sessionCheck.completeCheckpoint(2), (req, res) => {
    // Redirect to access page (checkpoint 3) after successful completion
    res.redirect('/access');
});

// Alternative POST routes for manual completion (testing purposes)
router.post('/1/complete', sessionCheck.completeCheckpoint(1), (req, res) => {
    res.json({ 
        success: true, 
        message: 'Checkpoint 1 completed',
        redirect: '/checkpoint/2'
    });
});

router.post('/2/complete', sessionCheck.completeCheckpoint(2), (req, res) => {
    res.json({ 
        success: true, 
        message: 'Checkpoint 2 completed',
        redirect: '/access'
    });
});

// Reset progress (for testing)
router.get('/reset', sessionCheck.resetSession, (req, res) => {
    res.redirect('/checkpoint/1');
});

// Get current checkpoint status (API endpoint)
router.get('/status', (req, res) => {
    const checkpoint = req.session.checkpoint || {
        current: 0,
        completed: [],
        startTime: new Date(),
        ipAddress: req.ip
    };

    res.json({
        current: checkpoint.current,
        completed: checkpoint.completed,
        canAccess: {
            checkpoint1: true,
            checkpoint2: checkpoint.completed.includes(1),
            access: checkpoint.completed.includes(1) && checkpoint.completed.includes(2)
        },
        sessionInfo: {
            startTime: checkpoint.startTime,
            ipAddress: checkpoint.ipAddress
        }
    });
});

module.exports = router;