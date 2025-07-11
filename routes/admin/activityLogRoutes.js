// routes/activityLogRoutes.js
const express = require("express");
const router = express.Router();
const activityLogController = require("../../controllers/activityLogController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../../middleware/firebase_Auth");

// Apply authentication to all routes
router.use(verifyFirebaseToken, requireUser);

// Get all logs - admin only
router.get(
  "/",
  requireRole(["admin", "super_admin"]),
  activityLogController.getAllLogs
);

// Get logs by user - admin or owner only (check in controller)
router.get("/user/:userId", activityLogController.getUserLogs);

// Get current user's logs
router.get("/me", activityLogController.getMyLogs);

// Get logs by entity - admin only
router.get(
  "/entity/:entityType/:entityId",
  requireRole(["admin", "super_admin"]),
  activityLogController.getEntityLogs
);

// Get logs by action type - admin only
router.get(
  "/action/:actionType",
  requireRole(["admin", "super_admin"]),
  activityLogController.getActionLogs
);

// Create a log entry - accessible to all authenticated users
router.post("/", activityLogController.createLog);

module.exports = router;
