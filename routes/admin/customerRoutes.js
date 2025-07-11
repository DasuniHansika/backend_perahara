const express = require("express");
const router = express.Router();
const { verifyFirebaseToken } = require("../../middleware/auth");
const customerController = require("../../controllers/admin/customerController");

// Get all customers (admin only)
router.get("/", verifyFirebaseToken, customerController.getAllCustomers);

// Create new customer (with Firebase auth)
router.post(
  "/",
  customerController.upload, // Handle file upload
  verifyFirebaseToken,
  customerController.createCustomer
);

// Get customer profile by ID
router.get("/:id", verifyFirebaseToken, customerController.getCustomerById);

// Update customer profile
router.put(
  "/:id",
  customerController.upload, // Handle file upload
  verifyFirebaseToken,
  customerController.updateCustomer
);

// Get customer's booking history
router.get("/:id/bookings", verifyFirebaseToken, customerController.getCustomerBookings);

// Get customer's cart items
router.get("/:id/cart", verifyFirebaseToken, customerController.getCustomerCart);

module.exports = router;