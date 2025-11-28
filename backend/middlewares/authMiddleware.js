const jwt = require('jsonwebtoken');

// Auth middleware
function auth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer token

    if (!token) return res.status(401).json({ message: 'Access denied.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token.' });
        req.user = user; // Attach user info to request
        next(); // Proceed to the next middleware or route handler
    });
}

// Role-based access
function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied. Unauthorised to carry out function!' });
        }
        next(); // User has the right role, proceed
    };
}
module.exports = {
    auth, authorizeRoles
};