
const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../../middleware/firebase_Auth");
const firebaseAuthController = require("../../controllers/admin/firebaseAuthController");
const { query } = require("../../config/database-schema");

// Test endpoint to verify Firebase authentication
router.get("/me", verifyFirebaseToken, (req, res) => {
  res.json({
    success: true,
    message: "Firebase authentication successful",
    firebaseUid: req.firebaseUid,
    user: req.user || null,
  });
});

// Protected endpoint that requires registered user
router.get("/protected", verifyFirebaseToken, requireUser, (req, res) => {
  res.json({
    success: true,
    message: "You have access to this protected resource",
    user: req.user,
  });
});

// Sync Firebase user with local database
router.post("/sync", verifyFirebaseToken, firebaseAuthController.syncUser);

// Register new user
router.post('/register', verifyFirebaseToken, firebaseAuthController.registerUser);

// Link existing user to Firebase account (admin only)
router.put(
  "/link/:userId",
  verifyFirebaseToken,
  requireUser,
  firebaseAuthController.linkFirebaseAccount
);

// Check if username already exists
router.get("/check-username", verifyFirebaseToken, async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    const users = await query("SELECT user_id FROM users WHERE username = ?", [
      username,
    ]);

    return res.status(200).json({
      success: true,
      exists: users.length > 0,
    });
  } catch (error) {
    console.error("Error checking username:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking username",
      error: error.message,
    });
  }
});

// Set custom claims for a Firebase user (admin only)
router.post(
  "/set-custom-claims",
  verifyFirebaseToken,
  requireRole(["admin", "super_admin"]),
  async (req, res) => {
    const { uid, role } = req.body;

    // Validate input
    if (!uid || !role) {
      return res.status(400).json({
        success: false,
        message: "Both uid and role are required"
      });
    }

    // Validate role
    const allowedRoles = ["admin", "seller", "customer", "super_admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified",
        allowedRoles
      });
    }

    try {
      // Verify the user exists in Firebase
      try {
        await admin.auth().getUser(uid);
      } catch (error) {
        return res.status(404).json({
          success: false,
          message: "Firebase user not found"
        });
      }

      // Set custom claims
      await admin.auth().setCustomUserClaims(uid, { role });

      // Update local database if needed
      try {
        await query(
          "UPDATE users SET role = ? WHERE firebase_uid = ?",
          [role, uid]
        );
      } catch (dbError) {
        console.warn("Database role update failed:", dbError.message);
        // Continue even if DB update fails - claims are more important
      }

      return res.status(200).json({
        success: true,
        message: "Custom claims set successfully",
        uid,
        role
      });
    } catch (error) {
      console.error("Error setting custom claims:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to set custom claims",
        error: error.message
      });
    }
  }
);

router.post('/admin-token', verifyFirebaseToken, requireRole(["admin", "super_admin"]), async (req, res) => {
  try {
    const { uid } = req.body;
    
    if (!uid) {
      return res.status(400).json({ error: 'UID is required' });
    }

    // Verify the requesting user has permission to generate tokens
    if (!req.user.roles.includes('admin') && !req.user.roles.includes('super_admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const customToken = await admin.auth().createCustomToken(uid);
    
    res.json({ 
      success: true,
      token: customToken 
    });
  } catch (error) {
    console.error('Error creating custom token:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error generating auth token',
      details: error.message 
    });
  }
});


module.exports = router;