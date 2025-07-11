const express = require("express");
const router = express.Router();
const seatTypeController = require("../../controllers/admin/seatTypeController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../../middleware/firebase_Auth");
const upload = require("../../middleware/seatTypeUpload");

// Get seat types for a shop
router.get("/shop/:shopId", seatTypeController.getSeatTypesByShop);

// Get seat type by ID
router.get("/:id", seatTypeController.getSeatTypeById);

// Create seat type
router.post(
  "/",
  verifyFirebaseToken,
  seatTypeController.createSeatType // No multer middleware needed
);

// Update seat type
router.put(
  "/:id",
  verifyFirebaseToken,
  seatTypeController.updateSeatType // No multer middleware needed
);

// Delete seat type
router.delete(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole(["seller", "admin", "super_admin"]),
  seatTypeController.deleteSeatType
);




module.exports = router;