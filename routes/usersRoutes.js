const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const adminController = require("../controllers/adminController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../middleware/firebaseAuth");

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
  userController.getUserById
);

// POST create new user - admin only
router.post(
  "/",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  adminController.createUser
);

// PUT update user - with permission check
router.put("/:id", verifyFirebaseToken, requireUser, userController.updateUser);

// DELETE user - admin only
router.delete(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  adminController.deleteUser
);

module.exports = router;
