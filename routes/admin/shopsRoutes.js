const express = require("express");
const router = express.Router();
const shopController = require("../../controllers/admin/shopController");
const { verifyFirebaseToken, requireRole } = require("../../middleware/firebase_Auth");

// Get all shops
router.get("/", shopController.getAllShops);

// Get shop by ID
router.get("/:id", shopController.getShopById);

// Get shops by seller ID
router.get("/seller/:sellerId", verifyFirebaseToken, shopController.getSellerShops);

// Create new shop (seller or admin only)
router.post(
  "/",
  verifyFirebaseToken,
  requireRole(["seller", "admin"]),
  shopController.createShop
);

// Update shop (seller or admin only)
router.put(
  "/:id",
  verifyFirebaseToken,
  requireRole(["seller", "admin"]),
  shopController.updateShop
);

// Delete shop (admin only)
router.delete(
  "/:id",
  verifyFirebaseToken,
  requireRole(["admin"]),
  shopController.deleteShop
);

const validateShopId = (req, res, next) => {
  const { id } = req.params;
  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ error: "Invalid shop ID" });
  }
  next();
};

router.get('/:id', validateShopId, shopController.getShopById);
module.exports = router;