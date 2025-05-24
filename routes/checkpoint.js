const express = require('express');
const router = express.Router();

// Checkpoint 1 - Initial entry point
router.get('/1', (req, res) => {
  // Reset all checkpoint flags
  req.session.passed1 = false;
  req.session.passed2 = false;
  req.session.passed3 = false;
  
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
  
  res.render('checkpoint', {
    checkpoint: 3,
    title: 'Checkpoint 3 - Final Verification',
    message: 'Almost there! Complete the final verification step.',
    nextUrl: '/access'
  });
});

// Handle Linkvertise callback for checkpoint 1
router.get('/verify/1', (req, res) => {
  req.session.passed1 = true;
  res.redirect('/checkpoint/2');
});

// Handle Linkvertise callback for checkpoint 2
router.get('/verify/2', (req, res) => {
  if (!req.session.passed1) {
    return res.redirect('/checkpoint/1');
  }
  req.session.passed2 = true;
  res.redirect('/checkpoint/3');
});

// Handle Linkvertise callback for checkpoint 3
router.get('/verify/3', (req, res) => {
  if (!req.session.passed1 || !req.session.passed2) {
    return res.redirect('/checkpoint/1');
  }
  req.session.passed3 = true;
  res.redirect('/access');
});

module.exports = router;