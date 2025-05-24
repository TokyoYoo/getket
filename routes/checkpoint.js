const express = require('express');
const router = express.Router();
const { generateFingerprint } = require('../utils/auth');

// Checkpoint 1 - Initial entry point
router.get('/1', (req, res) => {
  // Reset all checkpoint flags
  req.session.passed1 = false;
  req.session.passed2 = false;
  req.session.passed3 = false;
  
  // Store fingerprint for session tracking
  req.session.fingerprint = generateFingerprint(req);
  req.session.startTime = new Date();
  
  res.render('checkpoint', {
    checkpoint: 1,
    title: 'Checkpoint 1 - Verification Required',
    message: 'Please complete the verification to proceed to the next step.',
    nextUrl: '/checkpoint/2'
  });
});

// Checkpoint 2 - Must have passed checkpoint 1
router.get('/2', (req, res) => {
  // Check if came from Linkvertise (this flag is set by Linkvertise redirect)
  if (!req.session.passed1) {
    return res.redirect('/checkpoint/1');
  }
  
  // Verify fingerprint consistency
  const currentFingerprint = generateFingerprint(req);
  if (req.session.fingerprint && req.session.fingerprint !== currentFingerprint) {
    // Browser/device changed, reset session
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      return res.redirect('/checkpoint/1');
    });
    return;
  }
  
  res.render('checkpoint', {
    checkpoint: 2,
    title: 'Checkpoint 2 - Second Verification',
    message: 'Great! Now complete the second verification step.',
    nextUrl: '/checkpoint/3'
  });
});

// Checkpoint 3 - Must have passed checkpoint 2
router.get('/3', (req, res) => {
  if (!req.session.passed1 || !req.session.passed2) {
    return res.redirect('/checkpoint/1');
  }
  
  // Verify fingerprint consistency
  const currentFingerprint = generateFingerprint(req);
  if (req.session.fingerprint && req.session.fingerprint !== currentFingerprint) {
    // Browser/device changed, reset session
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      return res.redirect('/checkpoint/1');
    });
    return;
  }
  
  res.render('checkpoint', {
    checkpoint: 3,
    title: 'Checkpoint 3 - Final Verification',
    message: 'Almost there! Complete the final verification step.',
    nextUrl: '/access'
  });
});

// Handle Linkvertise callback for checkpoint 1
router.get('/verify/1', (req, res) => {
  // Verify fingerprint consistency
  const currentFingerprint = generateFingerprint(req);
  if (req.session.fingerprint && req.session.fingerprint !== currentFingerprint) {
    // Browser/device changed, reset session
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      return res.redirect('/checkpoint/1');
    });
    return;
  }
  
  req.session.passed1 = true;
  req.session.checkpoint1Time = new Date();
  res.redirect('/checkpoint/2');
});

// Handle Linkvertise callback for checkpoint 2
router.get('/verify/2', (req, res) => {
  if (!req.session.passed1) {
    return res.redirect('/checkpoint/1');
  }
  
  // Verify fingerprint consistency
  const currentFingerprint = generateFingerprint(req);
  if (req.session.fingerprint && req.session.fingerprint !== currentFingerprint) {
    // Browser/device changed, reset session
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      return res.redirect('/checkpoint/1');
    });
    return;
  }
  
  req.session.passed2 = true;
  req.session.checkpoint2Time = new Date();
  res.redirect('/checkpoint/3');
});

// Handle Linkvertise callback for checkpoint 3
router.get('/verify/3', (req, res) => {
  if (!req.session.passed1 || !req.session.passed2) {
    return res.redirect('/checkpoint/1');
  }
  
  // Verify fingerprint consistency
  const currentFingerprint = generateFingerprint(req);
  if (req.session.fingerprint && req.session.fingerprint !== currentFingerprint) {
    // Browser/device changed, reset session
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      return res.redirect('/checkpoint/1');
    });
    return;
  }
  
  req.session.passed3 = true;
  req.session.checkpoint3Time = new Date();
  res.redirect('/access');
});

// API endpoint to check session progress
router.get('/api/progress', (req, res) => {
  const fingerprint = generateFingerprint(req);
  
  // Check fingerprint consistency
  if (req.session.fingerprint && req.session.fingerprint !== fingerprint) {
    return res.json({
      error: 'Session invalid',
      message: 'Browser or device changed',
      redirect: '/checkpoint/1'
    });
  }
  
  res.json({
    sessionId: req.sessionID,
    fingerprint: req.session.fingerprint,
    startTime: req.session.startTime,
    checkpoints: {
      passed1: !!req.session.passed1,
      passed2: !!req.session.passed2,
      passed3: !!req.session.passed3,
      checkpoint1Time: req.session.checkpoint1Time,
      checkpoint2Time: req.session.checkpoint2Time,
      checkpoint3Time: req.session.checkpoint3Time
    },
    canAccessKey: !!(req.session.passed1 && req.session.passed2 && req.session.passed3)
  });
});

// Reset session endpoint (for testing/debugging)
router.post('/reset', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ error: 'Failed to reset session' });
    }
    res.json({ success: true, message: 'Session reset successfully' });
  });
});

module.exports = router;