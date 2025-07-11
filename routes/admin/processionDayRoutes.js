const express = require("express");
const router = express.Router();
const processionDayController = require("../../controllers/admin/processionDayController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../../middleware/firebase_Auth");

// Middleware to validate procession day ID
const validateProcessionDayId = (req, res, next) => {
  const { id } = req.params;
  
  // Check if ID exists and is a positive integer
  if (!id || !/^\d+$/.test(id) || parseInt(id) <= 0) {
    return res.status(400).json({ 
      success: false,
      error: "Invalid procession day ID. Must be a positive integer." 
    });
  }
  
  // Convert to number and attach to request for consistency
  req.params.id = parseInt(id);
  next();
};

// Get all procession days - public
router.get("/", processionDayController.getAllDays);

// Get procession day by ID - public
router.get("/:id", validateProcessionDayId, processionDayController.getDayById);

// Get shops available on a specific day - public
// Get shops available on a specific day - public
router.get("/:id/shops", validateProcessionDayId, processionDayController.getAvailableShops);

// Create new procession day - admin only
router.post(
  "/",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  processionDayController.createDay
);

// Update procession day - admin only
router.put(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  validateProcessionDayId,
  processionDayController.updateDay
);
router.get(
  '/shops/:shopId/seat-types',
  processionDayController.getShopSeatTypes
);

// Delete procession day - admin only
router.delete(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  validateProcessionDayId,
  processionDayController.deleteDay
);
// In your backend routes file
router.get('/procession/days/:day_id/details', async (req, res) => {
  try {
    const dayId = req.params.day_id;
    // Your logic to fetch day details
    res.json({
      success: true,
      day: { /* your day details data */ }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;