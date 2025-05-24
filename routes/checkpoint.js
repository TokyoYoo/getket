const express = require('express');
const router = express.Router();
const sessionCheck = require('../middleware/sessionCheck');

// Initialize session for all checkpoint routes
router.use(sessionCheck.initSession);
router.use(sessionCheck.getProgress);

// Checkpoint 1 - First advertisement
router.get('/1', sessionCheck.canAccessCheckpoint(1), (req, res) => {
    const nextUrl = `https://linkvertise.com/57731/get-key-checkpoint-1?redirect=${encodeURIComponent(req.protocol + '://' + req.get('host') + '/checkpoint/1/complete')}`;
    
    res.render('checkpoint', {
        title: 'Checkpoint 1 - Advertisement',
        checkpointNumber: 1,
        description: 'Complete the first advertisement to proceed to checkpoint 2',
        nextUrl: nextUrl,
        progress: req.sessionProgress,
        isCompleted: req.sessionProgress.checkpoint1
    });
});

// Checkpoint 1 completion handler
router.get('/1/complete', sessionCheck.completeCheckpoint(1), (req, res) => {
    res.redirect('/checkpoint/2');
});

// Checkpoint 2 - Second advertisement
router.get('/2', sessionCheck.canAccessCheckpoint(2), (req, res) => {
    const nextUrl = `https://linkvertise.com/57731/get-key-checkpoint-2?redirect=${encodeURIComponent(req.protocol + '://' + req.get('host') + '/checkpoint/2/complete')}`;
    
    res.render('checkpoint', {
        title: 'Checkpoint 2 - Second Advertisement',
        checkpointNumber: 2,
        description: 'Complete the second advertisement to proceed to the final step',
        nextUrl: nextUrl,
        progress: req.sessionProgress,
        isCompleted: req.sessionProgress.checkpoint2
    });
});

// Checkpoint 2 completion handler
router.get('/2/complete', sessionCheck.completeCheckpoint(2), (req, res) => {
    res.redirect('/access');
});

// Checkpoint 3 redirect (handled by access route)
router.get('/3', (req, res) => {
    res.redirect('/access');
});

// API endpoint to check checkpoint status
router.get('/status', (req, res) => {
    res.json({
        success: true,
        progress: req.sessionProgress,
        sessionId: req.sessionID
    });
});

// Manual checkpoint completion (for testing or special cases)
router.post('/:number/complete', (req, res) => {
    const checkpointNumber = parseInt(req.params.number);
    
    if (checkpointNumber < 1 || checkpointNumber > 2) {
        return res.status(400).json({ error: 'Invalid checkpoint number' });
    }

    // Apply completion middleware
    sessionCheck.completeCheckpoint(checkpointNumber)(req, res, () => {
        res.json({ 
            success: true, 
            message: `Checkpoint ${checkpointNumber} completed`,
            nextCheckpoint: checkpointNumber === 1 ? '/checkpoint/2' : '/access'
        });
    });
});

module.exports = router;