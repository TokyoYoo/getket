// Middleware for admin authentication

const adminAuth = (req, res, next) => {
  // Check if admin is already logged in
  if (req.session.isAdmin) {
    return next();
  }
  
  // If not logged in, show login form
  if (req.method === 'GET') {
    return res.render('layout', {
      title: 'Admin Login',
      body: `
        <div class="container">
          <div class="login-form">
            <h2>Admin Login</h2>
            <form method="POST" action="${req.originalUrl}">
              <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
              </div>
              <button type="submit" class="btn">Login</button>
            </form>
          </div>
        </div>
      `
    });
  }
  
  // Handle login POST request
  if (req.method === 'POST') {
    const { password } = req.body;
    
    if (password === process.env.ADMIN_PASSWORD) {
      req.session.isAdmin = true;
      return next();
    } else {
      return res.render('layout', {
        title: 'Admin Login',
        body: `
          <div class="container">
            <div class="login-form">
              <h2>Admin Login</h2>
              <div class="error">Invalid password. Please try again.</div>
              <form method="POST" action="${req.originalUrl}">
                <div class="form-group">
                  <label for="password">Password:</label>
                  <input type="password" id="password" name="password" required>
                </div>
                <button type="submit" class="btn">Login</button>
              </form>
            </div>
          </div>
        `
      });
    }
  }
  
  res.status(401).json({ error: 'Unauthorized' });
};

// Logout admin
const adminLogout = (req, res) => {
  req.session.isAdmin = false;
  res.redirect('/dashboard');
};

module.exports = {
  adminAuth,
  adminLogout
};