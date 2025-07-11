// routes/processionDayRoutes.js
const express = require("express");
const router = express.Router();
const processionDayController = require("../controllers/processionDayController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../middleware/firebaseAuth");

// Get all procession days - public
router.get("/", processionDayController.getAllDays);

// Task 2: Get procession days for find seats - public
router.get("/find-seats", processionDayController.getProcessionDays);

// Task 3: Get streets with shop counts - public
router.get("/streets", processionDayController.getStreets);

// Task 4: Get price range - public
router.get("/price-range", processionDayController.getPriceRange);

// Task 5: Search shops with filters - public
router.get("/shops/search", processionDayController.searchShops);

// Get procession day by ID - public
router.get("/:id", processionDayController.getDayById);

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
  processionDayController.updateDay
);

// Delete procession day - admin only
router.delete(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  processionDayController.deleteDay
);

// Get shops available on a specific day - public
router.get("/:dayId/shops", processionDayController.getAvailableShops);

module.exports = router;
