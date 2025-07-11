// routes/seatTypeRoutes.js
const express = require("express");
const router = express.Router();
const seatTypeController = require("../controllers/seatTypeController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../middleware/firebaseAuth");

// Get seat types for a shop - public
router.get("/shop/:shopId", seatTypeController.getSeatTypesByShopId);

// Get seat type by ID - public
router.get("/:id", seatTypeController.getSeatTypeById);

// Create seat type - seller/admin only (now accepts JSON with base64 image)
router.post(
  "/",
  verifyFirebaseToken,
  requireUser,
  requireRole(["seller", "admin", "super_admin"]),
  seatTypeController.createSeatType
);

// Update seat type - seller/admin only (now accepts JSON with base64 image)
router.put(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole(["seller", "admin", "super_admin"]),
  seatTypeController.updateSeatType
);

// Delete seat type - seller/admin only with permission check in controller
router.delete(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole(["seller", "admin", "super_admin"]),
  seatTypeController.deleteSeatType
);

// Update seat type availability - seller/admin only with permission check in controller
router.put(
  "/:id/availability/:dayId",
  verifyFirebaseToken,
  requireUser,
  requireRole(["seller", "admin", "super_admin"]),
  seatTypeController.updateSeatTypeAvailability
);

module.exports = router;
