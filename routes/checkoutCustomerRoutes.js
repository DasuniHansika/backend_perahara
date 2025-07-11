const express = require("express");
const router = express.Router();
const {
  storeCheckoutCustomer,
  updateCheckoutCustomerStatus,
} = require("../controllers/checkoutCustomerController");
const {
  verifyFirebaseToken,
  requireUser,
} = require("../middleware/firebaseAuth");

// Store checkout customer data when proceed to payment is clicked
router.post("/", verifyFirebaseToken, requireUser, storeCheckoutCustomer);

// Update checkout customer status after payment
router.put(
  "/status",
  verifyFirebaseToken,
  requireUser,
  updateCheckoutCustomerStatus
);

module.exports = router;
