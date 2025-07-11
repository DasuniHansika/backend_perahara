// routes/firebaseAuthRoutes.js
const express = require("express");
const router = express.Router();
const {
  verifyFirebaseToken,
  requireUser,
} = require("../middleware/firebaseAuth");
const firebaseAuthController = require("../controllers/firebaseAuthController");
const { query } = require("../config/database-schema");

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

// Register a new user after Firebase authentication
router.post(
  "/register",
  verifyFirebaseToken,
  firebaseAuthController.registerUser
);

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

module.exports = router;
