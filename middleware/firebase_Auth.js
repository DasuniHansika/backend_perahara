// middleware/firebaseAuth.js
const { admin } = require("../config/firebase");
const { query } = require("../config/database-schema");
const { handleFirebaseAuthError } = require("../utils/errorHandler");

/**
 * Middleware to verify Firebase Authentication token
 * Extracts the token from the Authorization header and verifies it
 * On successful verification, attaches the Firebase UID to the request
 */
const verifyFirebaseToken = async (req, res, next) => {
  try {
    // First check if Firebase Admin is initialized
    if (!admin.apps.length) {
      console.error("Firebase Admin has not been initialized");
      return res.status(500).json({
        success: false,
        message: "Server authentication service is not available",
      });
    }

    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No authentication token provided",
      });
    }

    // Extract the token
    const idToken = authHeader.split("Bearer ")[1];

    // Verify the token
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    // Add Firebase UID to request
    req.firebaseUid = decodedToken.uid; // Look up the user in our database
    // In the verifyFirebaseToken middleware
const users = await query(
  "SELECT user_id as id, username, role, firebase_uid FROM users WHERE firebase_uid = ?",
  [decodedToken.uid]
);

if (users.length > 0) {
  req.user = {
    id: users[0].id,
    username: users[0].username,
    role: users[0].role,
    firebaseUid: users[0].firebase_uid,
    uid: decodedToken.uid // Also include the raw Firebase UID
  };
}

    next();
  } catch (error) {
    console.error("Firebase token verification failed:", error);
    const errorResponse = handleFirebaseAuthError(error);
    return res.status(errorResponse.status).json({
      success: errorResponse.success,
      message: errorResponse.message,
      error: errorResponse.error,
    });
  }
};

/**
 * Middleware to verify that the user exists in our database
 * Must be used after verifyFirebaseToken
 */
const requireUser = (req, res, next) => {
  if (!req.user) {
    return res.status(403).json({
      success: false,
      message: "User not registered in the system",
    });
  }
  next();
};

/**
 * Middleware to require specific roles
 * Note: Currently simplified to allow all authenticated users
 */
// Update the requireRole function in firebaseAuth.js to:
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    next();
  };
};

/**
 * Middleware to log admin actions
 * Logs administrative actions for audit purposes
 */
const logAdminAction = (action) => {
  return (req, res, next) => {
    // Store action info for potential logging
    req.adminAction = action;
    // Continue to the next middleware/route handler
    next();
  };
};
// Example Express middleware
const validateFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(403).send('Unauthorized');
  
  const token = authHeader.split(' ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(403).send('Invalid token');
  }
};

module.exports = {
  validateFirebaseToken,
  verifyFirebaseToken,
  requireUser,
  requireRole,
  logAdminAction,
};

