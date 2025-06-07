// scripts/create-admin-hash.js
const bcrypt = require('bcrypt');

async function createAdminHash() {
    const password = process.argv[2];
    
    if (!password) {
        console.log('Usage: node scripts/create-admin-hash.js <password>');
        process.exit(1);
    }
    
    try {
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);
        
        console.log('\n=== Admin Setup ===');
        console.log('Add these to your .env file:');
        console.log(`ADMIN_USERNAME=admin`);
        console.log(`ADMIN_PASSWORD_HASH=${hash}`);
        console.log(`JWT_SECRET=${require('crypto').randomBytes(64).toString('hex')}`);
        console.log('\nAdmin login URL: http://localhost:3000/admin/login');
        console.log(`Username: admin`);
        console.log(`Password: ${password}`);
        
    } catch (error) {
        console.error('Error creating hash:', error);
    }
}

createAdminHash();