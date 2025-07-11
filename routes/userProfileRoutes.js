// routes/userProfileRoutes.js
const express = require("express");
const router = express.Router();
const {
  verifyFirebaseToken,
  requireUser,
} = require("../middleware/firebaseAuth");
const userProfileController = require("../controllers/userController");
const upload = require("../middleware/profileUpload");

// Get current user's profile
router.get(
  "/me",
  verifyFirebaseToken,
  requireUser,
  userProfileController.getMyProfile
);

// Update current user's profile
router.put(
  "/me",
  verifyFirebaseToken,
  requireUser,
  userProfileController.updateMyProfile
);

// Update current user's profile with image
router.put(
  "/me/with-image",
  verifyFirebaseToken,
  requireUser,
  upload.single("profileImage"),
  userProfileController.updateProfileWithImage
);

// Update user's email
router.put(
  "/me/email",
  verifyFirebaseToken,
  requireUser,
  userProfileController.updateEmail
);

// Delete current user's account
router.delete(
  "/me",
  verifyFirebaseToken,
  requireUser,
  userProfileController.deleteAccount
);

module.exports = router;
