const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const redis = require('redis');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Redis client setup
const redisClient = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
});

redisClient.on('error', (err) => {
    console.log('Redis Client Error', err);
});

redisClient.connect().catch(console.error);

// MongoDB connection
mongoose.connect('mongodb+srv://Getkeyway:eeUSxcB2qWiDKwVd@cluster0.owt70md.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
    }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
const checkpointRoutes = require('./routes/checkpoint');
const accessRoutes = require('./routes/access');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

app.use('/checkpoint', checkpointRoutes);
app.use('/access', accessRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/api', apiRoutes);

// Home route - redirect to checkpoint 1
app.get('/', (req, res) => {
    res.redirect('/checkpoint/1');
});

// Clean up expired keys every hour
setInterval(async () => {
    try {
        const Key = require('./models/Key');
        await Key.deleteMany({ expiresAt: { $lt: new Date() } });
        console.log('Cleaned up expired keys');
    } catch (error) {
        console.error('Error cleaning up expired keys:', error);
    }
}, 60 * 60 * 1000); // 1 hour

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        title: 'Error',
        message: 'Something went wrong!' 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', { 
        title: '404 Not Found',
        message: 'Page not found!' 
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});