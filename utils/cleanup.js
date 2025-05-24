const cron = require('node-cron');
const Key = require('../models/Key');

// Cleanup expired keys and sessions
const cleanupExpiredData = async () => {
  try {
    console.log('Starting cleanup of expired keys and sessions...');
    
    // Find expired keys
    const expiredKeys = await Key.find({
      $or: [
        { expiresAt: { $lt: new Date() } },
        { status: 'expired' }
      ]
    });
    
    console.log(`Found ${expiredKeys.length} expired keys`);
    
    // Delete expired keys (this will also trigger session cleanup)
    const deleteResult = await Key.deleteMany({
      $or: [
        { expiresAt: { $lt: new Date() } },
        { status: 'expired' }
      ]
    });
    
    console.log(`Cleanup completed: ${deleteResult.deletedCount} keys removed`);
    
    return deleteResult.deletedCount;
  } catch (error) {
    console.error('Cleanup error:', error);
    return 0;
  }
};

// Manual cleanup function (for admin dashboard)
const performManualCleanup = async () => {
  return await cleanupExpiredData();
};

// Start automatic cleanup scheduler
const startCleanupScheduler = () => {
  // Run cleanup every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('Running scheduled cleanup...');
    await cleanupExpiredData();
  });
  
  // Also run cleanup every hour during peak hours (if needed)
  cron.schedule('0 * * * *', async () => {
    console.log('Running hourly cleanup check...');
    
    // Count total keys
    const totalKeys = await Key.countDocuments();
    const expiredKeys = await Key.countDocuments({
      expiresAt: { $lt: new Date() }
    });
    
    console.log(`Database status: ${totalKeys} total keys, ${expiredKeys} expired`);
    
    // If more than 10% of keys are expired, run cleanup
    if (expiredKeys > 0 && (expiredKeys / totalKeys) > 0.1) {
      console.log('High percentage of expired keys detected, running cleanup...');
      await cleanupExpiredData();
    }
  });
  
  console.log('Cleanup scheduler started');
  
  // Run initial cleanup on startup
  setTimeout(async () => {
    console.log('Running initial cleanup...');
    await cleanupExpiredData();
  }, 5000);
};

// Get cleanup statistics
const getCleanupStats = async () => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const stats = {
      totalKeys: await Key.countDocuments(),
      activeKeys: await Key.countDocuments({ 
        expiresAt: { $gt: now },
        status: 'active'
      }),
      expiredKeys: await Key.countDocuments({
        expiresAt: { $lt: now }
      }),
      keysCreatedLastHour: await Key.countDocuments({
        createdAt: { $gt: oneHourAgo }
      }),
      keysCreatedLastDay: await Key.countDocuments({
        createdAt: { $gt: oneDayAgo }
      })
    };
    
    return stats;
  } catch (error) {
    console.error('Error getting cleanup stats:', error);
    return null;
  }
};

module.exports = {
  cleanupExpiredData,
  performManualCleanup,
  startCleanupScheduler,
  getCleanupStats
};