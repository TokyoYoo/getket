const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();

// Connect to MongoDB
mongoose.connect('mongodb+srv://Getkeyway:eeUSxcB2qWiDKwVd@cluster0.owt70md.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: 'mongodb+srv://Getkeyway:eeUSxcB2qWiDKwVd@cluster0.owt70md.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
        touchAfter: 24 * 3600 // lazy session update
    }),
    cookie: {
        secure: false, // set to true if using HTTPS
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        sameSite: 'lax'
    }
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Import routes
const checkpointRoutes = require('./routes/checkpoint');
const accessRoutes = require('./routes/access');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

// Use routes
app.use('/checkpoint', checkpointRoutes);
app.use('/access', accessRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/api', apiRoutes);

// Root route - redirect to checkpoint 1
app.get('/', (req, res) => {
    res.redirect('/checkpoint/1');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});