const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Driver = require('../models/Driver');
const Customer = require('../models/Customer');

const verifyRole = (roles) => {
  // Convert single role to array
  if (!Array.isArray(roles)) {
    roles = [roles];
  }
  
  return async (req, res, next) => {
    try {
      // Check if token exists
      let token;
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
      }
      
      if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
      }
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user with this role and ID exists
      const roleType = decoded.role;
      const id = decoded[`${roleType}_id`];
      
      if (!roles.includes(roleType)) {
        return res.status(403).json({ message: 'Not authorized for this operation' });
      }
      
      // Check if user exists in the appropriate collection
      let user;
      
      switch (roleType) {
        case 'admin':
          user = await Admin.findOne({ admin_id: id }).select('-password');
          break;
        case 'driver':
          user = await Driver.findOne({ driver_id: id }).select('-password');
          break;
        case 'customer':
          user = await Customer.findOne({ customer_id: id }).select('-password');
          break;
        default:
          return res.status(403).json({ message: 'Invalid user role' });
      }
      
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }
      
      // Check if user is deleted
      if (user.is_deleted) {
        return res.status(401).json({ message: 'Account has been deleted' });
      }
      
      // Attach user info to request
      req.user = { 
        ...user.toObject(),
        role: roleType 
      };
      
      next();
    } catch (error) {
      // Handle token errors
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token' });
      }
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      }
      
      res.status(500).json({ message: 'Server error' });
    }
  };
};

module.exports = verifyRole;