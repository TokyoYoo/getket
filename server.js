const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

// Import routes
const checkpointRoutes = require('./routes/checkpoint');
const accessRoutes = require('./routes/access');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

// Import cleanup utility
const { startCleanupScheduler } = require('./utils/cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware with CSP for Linkvertise
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://publisher.linkvertise.com"
      ],
      connectSrc: [
        "'self'",
        "https://publisher.linkvertise.com",
        "https://linkvertise.com"
      ],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB successfully');
}).catch((err) => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Session configuration with MongoDB store
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60 // 24 hours
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Device fingerprinting middleware
app.use((req, res, next) => {
  const fingerprint = `${req.ip}-${req.get('User-Agent') || 'unknown'}`;
  req.deviceFingerprint = fingerprint;
  
  if (!req.session.fingerprint) {
    req.session.fingerprint = fingerprint;
  }
  
  next();
});

// Routes
app.use('/checkpoint', checkpointRoutes);
app.use('/access', accessRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/api', apiRoutes);

// Home route - redirect to checkpoint 1
app.get('/', (req, res) => {
  res.redirect('/checkpoint/1');
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('layout', {
    title: 'Page Not Found',
    body: `
      <div class="container">
        <div class="error-box">
          <h1>404 - Page Not Found</h1>
          <p>The page you're looking for doesn't exist.</p>
          <a href="/checkpoint/1" class="btn">Start Over</a>
        </div>
      </div>
    `
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).render('layout', {
    title: 'Server Error',
    body: `
      <div class="container">
        <div class="error-box">
          <h1>500 - Server Error</h1>
          <p>Something went wrong on our end.</p>
          <a href="/checkpoint/1" class="btn">Start Over</a>
        </div>
      </div>
    `
  });
});

// Start cleanup scheduler
startCleanupScheduler();

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});