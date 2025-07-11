// routes/dashboardRoutes.js
const express = require("express");
const router = express.Router();
const dashboardController = require("../../controllers/admin/dashboardController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../../middleware/firebase_Auth");

// Get dashboard summary - admin only
router.get(
  "/summary",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  dashboardController.getDashboardSummary
);

// Get day-by-day report - admin only
router.get(
  "/day-by-day",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  dashboardController.getDayByDayReport
);

// Get seller performance report - admin only
router.get(
  "/seller-performance",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  dashboardController.getSellerPerformance
);

module.exports = router;