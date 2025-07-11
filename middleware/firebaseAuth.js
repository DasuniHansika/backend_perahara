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
  const startTime = Date.now();
  console.log(
    `🔐 [FirebaseAuth] Starting token verification for ${req.method} ${
      req.path
    } at ${new Date().toISOString()}`
  );

  try {
    // First check if Firebase Admin is initialized
    if (!admin.apps.length) {
      console.error(
        "❌ [FirebaseAuth] Firebase Admin has not been initialized"
      );
      return res.status(500).json({
        success: false,
        message: "Server authentication service is not available",
      });
    }
    console.log("✅ [FirebaseAuth] Firebase Admin is initialized");

    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    console.log(
      `🔍 [FirebaseAuth] Authorization header present: ${!!authHeader}`
    );

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ [FirebaseAuth] No valid authorization header found");
      return res.status(401).json({
        success: false,
        message: "No authentication token provided",
      });
    }

    // Extract the token
    const idToken = authHeader.split("Bearer ")[1];
    console.log(
      `🎫 [FirebaseAuth] Token extracted, length: ${
        idToken ? idToken.length : 0
      }`
    );

    // Verify the token
    console.log("🔍 [FirebaseAuth] Verifying Firebase token...");
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken) {
      console.log(
        "❌ [FirebaseAuth] Token verification failed - no decoded token"
      );
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    console.log(
      `✅ [FirebaseAuth] Token verified successfully for UID: ${decodedToken.uid}`
    );

    // Add Firebase UID to request
    req.firebaseUid = decodedToken.uid;

    // Look up the user in our database
    console.log(`🗄️ [FirebaseAuth] Looking up user in database...`);
    const users = await query(
      "SELECT user_id, username, role FROM users WHERE firebase_uid = ?",
      [decodedToken.uid]
    );

    console.log(
      `📊 [FirebaseAuth] Database lookup completed. Users found: ${users.length}`
    );

    if (users.length > 0) {
      // User exists in our database, attach user info to request
      const user = users[0];
      req.user = {
        id: user.user_id,
        username: user.username,
        role: user.role,
        uid: decodedToken.uid,
        firebaseUid: decodedToken.uid,
      };
      console.log(
        `✅ [FirebaseAuth] User attached to request: ${user.username} (${user.role})`
      );
    } else {
      console.log(
        `⚠️ [FirebaseAuth] User with UID ${decodedToken.uid} not found in database`
      );
    }

    const processingTime = Date.now() - startTime;
    console.log(
      `✅ [FirebaseAuth] Authentication completed successfully in ${processingTime}ms`
    );

    next();
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(
      `💥 [FirebaseAuth] Token verification failed after ${processingTime}ms:`,
      error
    );
    console.error(`📊 [FirebaseAuth] Error type: ${error.constructor.name}`);
    console.error(`📊 [FirebaseAuth] Error code: ${error.code}`);

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
const requireRole = (roles) => {
  return (req, res, next) => {
    // Role-based authorization removed - all authenticated users can proceed
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

module.exports = {
  verifyFirebaseToken,
  requireUser,
  requireRole,
  logAdminAction,
};
