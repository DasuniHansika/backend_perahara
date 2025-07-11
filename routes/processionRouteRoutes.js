// routes/processionRouteRoutes.js
const express = require("express");
const router = express.Router();
const processionRouteController = require("../controllers/processionRouteController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../middleware/firebaseAuth");

// Get route for a specific day - public
router.get("/day/:dayId", processionRouteController.getRouteByDayId);

// Create/update route points - admin only
router.post(
  "/day/:dayId",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  processionRouteController.upsertRoute
);

// Add a single route point - admin only
router.post(
  "/point",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  processionRouteController.addRoutePoint
);

// Update a single route point - admin only
router.put(
  "/point/:pointId",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  processionRouteController.updateRoutePoint
);

// Delete a single route point - admin only
router.delete(
  "/point/:pointId",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  processionRouteController.deleteRoutePoint
);

// Clear entire route for a day - admin only
router.delete(
  "/day/:dayId",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  processionRouteController.clearRoute
);

module.exports = router;
