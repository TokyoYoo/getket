const express = require('express');
const router = express.Router();
const { 
  initializeSession, 
  checkCheckpointAccess, 
  validateLinkvertiseCallback 
} = require('../middleware/sessionCheck');

// Apply session initialization to all routes
router.use(initializeSession);

// Checkpoint 1 route
router.get('/1', checkCheckpointAccess(1), (req, res) => {
  res.render('checkpoint', {
    title: 'Checkpoint 1',
    checkpointNumber: 1,
    nextUrl: '/checkpoint/1/complete',
    message: 'Complete the first verification step',
    progress: 33
  });
});

// Checkpoint 1 completion (Linkvertise callback)
router.get('/1/complete', validateLinkvertiseCallback(1));

// Checkpoint 2 route
router.get('/2', checkCheckpointAccess(2), (req, res) => {
  res.render('checkpoint', {
    title: 'Checkpoint 2',
    checkpointNumber: 2,
    nextUrl: '/checkpoint/2/complete',
    message: 'Complete the second verification step',
    progress: 66
  });
});

// Checkpoint 2 completion (Linkvertise callback)
router.get('/2/complete', validateLinkvertiseCallback(2));

// Checkpoint 3 route
router.get('/3', checkCheckpointAccess(3), (req, res) => {
  res.render('checkpoint', {
    title: 'Checkpoint 3',
    checkpointNumber: 3,
    nextUrl: '/checkpoint/3/complete',
    message: 'Complete the final verification step',
    progress: 100
  });
});

// Checkpoint 3 completion (Linkvertise callback)
router.get('/3/complete', validateLinkvertiseCallback(3));

// Reset route (for testing/debugging)
router.get('/reset', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/checkpoint/1');
  });
});

module.exports = router;