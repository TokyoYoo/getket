const crypto = require('crypto');

function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

function generateKey() {
    // Generate random key with format: XXXX-XXXX-XXXX-XXXX
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    
    for (let i = 0; i < 4; i++) {
        if (i > 0) result += '-';
        for (let j = 0; j < 4; j++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    }
    
    return result;
}

function getBrowserFingerprint(req) {
    // Simple browser fingerprinting based on headers
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const acceptEncoding = req.headers['accept-encoding'] || '';
    
    return crypto.createHash('md5')
        .update(userAgent + acceptLanguage + acceptEncoding)
        .digest('hex');
}

module.exports = { generateSessionId, generateKey, getBrowserFingerprint };