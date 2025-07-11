const express = require("express");
const router = express.Router();
const userController = require("../../controllers/admin/userController");
const missingFunctions = require("../../controllers/admin/missingFunctions");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../../middleware/firebase_Auth");







// GET all users - admin only
router.get(
  "/",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  userController.getAllUsers
);

// GET single user - with permission check
router.get(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  missingFunctions.getUserById
);


router.post(
  "/",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  userController.createUser 
);


// // PUT update user - with permission check
// router.put(
//   "/:id",
//   verifyFirebaseToken,
//   requireUser,
//   missingFunctions.updateUser
// );
// PUT update user - with permission check
router.put(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  userController.updateUser
);
// POST reset password - admin only (no current password required)
router.post(
  "/:id/reset-password",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  userController.adminResetPassword
);
// DELETE user - admin only
router.delete(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  missingFunctions.deleteUser
);


router.get(
  "/verify-admin",
  verifyFirebaseToken,
  requireRole(["admin", "super_admin"]), 
  userController.verifyAdmin
);

// GET user statistics - admin only
router.get(
  "/stats",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  userController.getUserStats
);

module.exports = router;
