const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://Getkeyway:eeUSxcB2qWiDKwVd@cluster0.owt70md.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb+srv://Getkeyway:eeUSxcB2qWiDKwVd@cluster0.owt70md.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
    collectionName: 'sessions'
  }),
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
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

// API route for key verification
app.get('/api/verify-key/:key', async (req, res) => {
  try {
    const Key = require('./models/Key');
    const { key } = req.params;
    
    const keyDoc = await Key.findOne({ key: key });
    
    if (!keyDoc) {
      return res.json({ valid: false, message: 'Key not found' });
    }
    
    if (keyDoc.expiresAt < new Date()) {
      // Key expired, remove it
      await Key.deleteOne({ _id: keyDoc._id });
      return res.json({ valid: false, message: 'Key expired' });
    }
    
    res.json({ 
      valid: true, 
      message: 'Key is valid',
      expiresAt: keyDoc.expiresAt 
    });
    
  } catch (error) {
    console.error('Error verifying key:', error);
    res.status(500).json({ valid: false, message: 'Server error' });
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});