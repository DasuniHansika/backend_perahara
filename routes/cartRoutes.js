// routes/cartRoutes.js
const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const {
  verifyFirebaseToken,
  requireUser,
} = require("../middleware/firebaseAuth");

// Apply authentication to all routes
router.use(verifyFirebaseToken, requireUser);

// Get current user's cart
router.get("/", cartController.getMyCart);

// Add item to cart
router.post("/", cartController.addToCart);

// Clear cart manually (different from checkout) - MUST come before /:cartItemId routes
router.delete("/clear-manual", cartController.clearCartManually);

// Update cart item quantity
router.put("/:cartItemId", cartController.updateCartItem);

// Remove item from cart
router.delete("/:cartItemId", cartController.removeFromCart);

// Clear entire cart
router.delete("/", cartController.clearCart);

// Check availability for all cart items
router.get("/check-availability", cartController.checkCartAvailability);

// Validate cart quantities
router.post("/validate-quantities", cartController.validateCartQuantities);

// Adjust cart quantities
router.post("/adjust-quantities", cartController.adjustCartQuantities);

// Get available quantity for a specific seat type and day
router.get("/available-quantity", cartController.getAvailableQuantity);

// Checkout - Create bookings from cart items
router.post("/checkout", cartController.checkout);

module.exports = router;
