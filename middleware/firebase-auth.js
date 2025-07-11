// filepath: d:\Disk_4\Projects\PeraheraGallery\flutter_app\server\middleware\firebase-auth.js
const admin = require("firebase-admin");
const { query } = require("../config/database-schema");

/**
 * Middleware to verify Firebase ID token
 */
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Allow request to proceed without authentication
      // For development/testing purposes
      console.warn("No authentication token provided");
      return next();
    }

    const idToken = authHeader.split("Bearer ")[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.firebaseUser = decodedToken;

      // Get user from database
      const [dbUser] = await query(
        "SELECT * FROM users WHERE firebase_uid = ?",
        [decodedToken.uid]
      );

      if (dbUser) {
        req.user = dbUser;
      }

      next();
    } catch (error) {
      console.error("Error verifying Firebase token:", error);
      // For development, we'll let the request continue even with invalid token
      next();
    }
  } catch (error) {
    console.error("Authentication error:", error);
    next();
  }
};

/**
 * Middleware to require user authentication
 * Use this to protect routes that require authentication
 */
const requireAuth = (req, res, next) => {
  if (!req.firebaseUser) {
    return res.status(401).json({
      error: "Authentication required",
      details: "You must be logged in to access this resource",
    });
  }
  next();
};

/**
 * Middleware to require seller role
 * Use this to protect routes that should only be accessed by sellers
 */
const requireSeller = (req, res, next) => {
  if (!req.user || req.user.role !== "seller") {
    return res.status(403).json({
      error: "Access denied",
      details: "This resource can only be accessed by sellers",
    });
  }
  next();
};

module.exports = {
  verifyFirebaseToken,
  requireAuth,
  requireSeller,
};
