const express = require("express");
const router = express.Router();
const shopController = require("../controllers/shopController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../middleware/firebaseAuth");

// Public search route for find seats page - no authentication required
router.get("/search", shopController.searchShops);

// Apply middleware to remaining routes
router.use(verifyFirebaseToken);

// Public routes - no authentication required (but token verified)
router.get("/", shopController.getAllShops);
router.get("/:id", shopController.getShopById);

// Protected routes - require authentication
router.get("/seller/:sellerId", requireUser, shopController.getSellerShops);
router.post(
  "/",
  requireUser,
  requireRole(["seller", "admin", "super_admin"]),
  shopController.createShop
);
router.put(
  "/:id",
  requireUser,
  requireRole(["seller", "admin", "super_admin"]),
  shopController.updateShop
);
router.delete(
  "/:id",
  requireUser,
  requireRole(["seller", "admin", "super_admin"]),
  shopController.deleteShop
);

module.exports = router;
