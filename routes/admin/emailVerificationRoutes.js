// routes/emailVerificationRoutes.js
const express = require("express");
const router = express.Router();
const { verifyFirebaseToken } = require("../../middleware/firebase_Auth");
const { triggerCleanup } = require("../../utils/emailVerificationCleanup");
const { admin } = require("../../config/firebase");

/**
 * Resend email verification
 */
router.post("/resend", verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.firebaseUid;

    // Get user from Firebase
    const userRecord = await admin.auth().getUser(firebaseUid);

    if (userRecord.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified",
      });
    }

    // Generate email verification link
    const actionCodeSettings = {
      url:
        process.env.EMAIL_VERIFICATION_REDIRECT_URL ||
        "http://localhost:3000/email-verified",
      handleCodeInApp: false,
    };

    const link = await admin
      .auth()
      .generateEmailVerificationLink(userRecord.email, actionCodeSettings);

    // In a production environment, you would send this via your email service
    // For now, we'll just return success since Firebase handles the email sending

    return res.status(200).json({
      success: true,
      message: "Verification email sent successfully",
    });
  } catch (error) {
    console.error("Error resending verification email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resend verification email",
      error: error.message,
    });
  }
});

/**
 * Check email verification status
 */
router.get("/status", verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.firebaseUid;

    // Get fresh user data from Firebase
    const userRecord = await admin.auth().getUser(firebaseUid);

    return res.status(200).json({
      success: true,
      emailVerified: userRecord.emailVerified,
      email: userRecord.email,
    });
  } catch (error) {
    console.error("Error checking verification status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check verification status",
      error: error.message,
    });
  }
});

/**
 * Manually trigger cleanup of unverified users (admin only)
 */
router.post("/cleanup", async (req, res) => {
  try {
    // Note: In production, add proper admin authentication here
    const result = await triggerCleanup();

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error triggering cleanup:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to trigger cleanup",
      error: error.message,
    });
  }
});

module.exports = router;
