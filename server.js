const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const path = require('path');
const { scheduleCleanup, cleanSessionData } = require('./utils/auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://Getkeyway:eeUSxcB2qWiDKwVd@cluster0.owt70md.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Initialize cleanup scheduler after DB connection
mongoose.connection.once('open', () => {
  console.log('Connected to MongoDB');
  scheduleCleanup();
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Session configuration with reduced maxAge for unused sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb+srv://Getkeyway:eeUSxcB2qWiDKwVd@cluster0.owt70md.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
    collectionName: 'sessions',
    ttl: 60 * 60 // 1 hour TTL for sessions without keys
  }),
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 hours, but will be cleaned if no key is generated within 1 hour
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
const checkpointRoutes = require('./routes/checkpoint');
const accessRoutes = require('./routes/access');
const dashboardRoutes = require('./routes/dashboard');

app.use('/checkpoint', checkpointRoutes);
app.use('/access', accessRoutes);
app.use('/dashboard', dashboardRoutes);

// Enhanced API route for key verification
app.get('/api/verify-key/:key', async (req, res) => {
  try {
    const Key = require('./models/Key');
    const { key } = req.params;
    
    const keyDoc = await Key.findOne({ key: key });
    
    if (!keyDoc) {
      return res.json({ valid: false, message: 'Key not found' });
    }
    
    if (keyDoc.expiresAt < new Date()) {
      // Key expired, clean session and remove key
      await cleanSessionData(keyDoc.sessionId);
      await Key.deleteOne({ _id: keyDoc._id });
      return res.json({ valid: false, message: 'Key expired' });
    }
    
    // Update last accessed time
    await keyDoc.updateLastAccessed();
    
    res.json({ 
      valid: true, 
      message: 'Key is valid',
      expiresAt: keyDoc.expiresAt,
      lastAccessed: keyDoc.lastAccessed,
      remainingTime: keyDoc.getRemainingTime()
    });
    
  } catch (error) {
    console.error('Error verifying key:', error);
    res.status(500).json({ valid: false, message: 'Server error' });
  }
});

// API route to get system stats
app.get('/api/stats', async (req, res) => {
  try {
    const Key = require('./models/Key');
    const mongoose = require('mongoose');
    
    const totalKeys = await Key.countDocuments();
    const activeKeys = await Key.countDocuments({ 
      expiresAt: { $gt: new Date() },
      isActive: true 
    });
    const expiredKeys = await Key.countDocuments({ 
      expiresAt: { $lte: new Date() } 
    });
    
    // Get session count
    const sessionCollection = mongoose.connection.db.collection('sessions');
    const totalSessions = await sessionCollection.countDocuments();
    
    res.json({
      totalKeys,
      activeKeys,
      expiredKeys,
      totalSessions,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Manual cleanup endpoint (for admin use)
app.post('/api/cleanup', async (req, res) => {
  try {
    const Key = require('./models/Key');
    
    const cleanupResult = await Key.cleanupExpiredKeys();
    const sessionCleanupResult = await Key.cleanupUnusedSessions();
    
    res.json({
      success: true,
      message: 'Cleanup completed',
      results: {
        ...cleanupResult,
        ...sessionCleanupResult
      }
    });
    
  } catch (error) {
    console.error('Error in manual cleanup:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// Root route redirect to checkpoint 1
app.get('/', (req, res) => {
  res.redirect('/checkpoint/1');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});