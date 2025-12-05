/**
 * Admin Only Middleware
 * Restricts access to admin users only
 */

const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }

  next();
};

module.exports = adminOnly;
