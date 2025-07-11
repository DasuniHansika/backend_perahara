// routes/cartRoutes.js
const express = require("express");
const router = express.Router();
const cartController = require("../../controllers/cartController");
const {
  verifyFirebaseToken,
  requireUser,
} = require("../../middleware/firebase_Auth");

// Apply authentication to all routes
router.use(verifyFirebaseToken, requireUser);

// Get current user's cart
router.get("/", cartController.getMyCart);

// Add item to cart
router.post("/", cartController.addToCart);

// Update cart item quantity
router.put("/:cartItemId", cartController.updateCartItem);

// Remove item from cart
router.delete("/:cartItemId", cartController.removeFromCart);

// Clear entire cart
router.delete("/", cartController.clearCart);

module.exports = router;
