const express = require("express");
const router = express.Router();
const {
  createPayment,
  createPaymentsForOrder,
  getAllPayments,
  getPaymentById,
  getPaymentsByBookingId,
  getPaymentsByUserId,
  updatePayment,
  deletePayment,
  getPaymentsByDateRange,
  getSellerPayments,
  getCustomerPayments,
  getCustomerPaymentHistory,
  getSellerPaymentHistory,
  // PayHere specific controllers
  getPayHerePaymentData,
  getPayHerePaymentDataForOrder,
  handlePayHereNotification,
} = require("../../controllers/admin/paymentController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../../middleware/firebaseAuth");

// Create a new payment - requires authentication
router.post("/", verifyFirebaseToken, requireUser, createPayment);

// Create payments for multiple bookings (one order) - requires authentication
router.post("/order", verifyFirebaseToken, requireUser, createPaymentsForOrder);

// Create payments for multiple bookings (alternative endpoint name) - requires authentication
router.post(
  "/create-order",
  verifyFirebaseToken,
  requireUser,
  createPaymentsForOrder
);

// Get all payments - admin only
router.get(
  "/",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  getAllPayments
);

// Get seller payments - for authenticated sellers
router.get(
  "/seller",
  verifyFirebaseToken,
  requireUser,
  requireRole(["seller", "admin", "super_admin"]),
  getSellerPayments
);

// Get seller payment history with hierarchical structure - for authenticated sellers
router.get(
  "/seller/history",
  verifyFirebaseToken,
  requireUser,
  requireRole(["seller", "admin", "super_admin"]),
  getSellerPaymentHistory
);

// Get customer payments - for authenticated customers
router.get(
  "/customer",
  verifyFirebaseToken,
  requireUser,
  requireRole(["customer", "admin", "super_admin"]),
  getCustomerPayments
);

// Get customer payment history with shop-wise grouping - for any authenticated user
router.get(
  "/customer/history",
  verifyFirebaseToken,
  requireUser,
  getCustomerPaymentHistory
);

// Get payment by ID - requires authentication with permission check in controller
router.get("/:id", verifyFirebaseToken, requireUser, getPaymentById);

// Get payments by booking ID - requires authentication with permission check in controller
router.get(
  "/booking/:bookingId",
  verifyFirebaseToken,
  requireUser,
  getPaymentsByBookingId
);

// Get payments by user ID - requires authentication with permission check in controller
router.get(
  "/user/:userId",
  verifyFirebaseToken,
  requireUser,
  getPaymentsByUserId
);

// Get payments by date range - admin only
router.get(
  "/date-range",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  getPaymentsByDateRange
);

// Update payment - admin or payment owner only (check in controller)
router.put("/:id", verifyFirebaseToken, requireUser, updatePayment);

// Delete payment - admin only
router.delete(
  "/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  deletePayment
);

// PayHere specific routes

// Get payment request data for PayHere checkout (single booking) - requires authentication
router.get(
  "/payhere/request/:bookingId",
  verifyFirebaseToken,
  requireUser,
  getPayHerePaymentData
);

// Get payment request data for PayHere checkout (multi-item order) - requires authentication
router.get(
  "/payhere/order/:payhereOrderId",
  verifyFirebaseToken,
  requireUser,
  getPayHerePaymentDataForOrder
);

// PayHere notification webhook - no authentication required (webhook)
router.post("/payhere/notify", handlePayHereNotification);

// PayHere return URL handler for web payments - no authentication required
router.get("/payhere/return", (req, res) => {
  try {
    console.log("🔄 PayHere return URL accessed");
    console.log("📋 Query parameters:", req.query);

    // Extract PayHere response parameters
    const {
      payment_id,
      payhere_amount,
      payhere_currency,
      status_code,
      md5sig,
      order_id,
      method,
      status_message,
      card_holder_name,
      card_no,
    } = req.query;

    console.log("✅ PayHere payment return details:");
    console.log(`  - Payment ID: ${payment_id}`);
    console.log(`  - Order ID: ${order_id}`);
    console.log(`  - Amount: ${payhere_amount} ${payhere_currency}`);
    console.log(`  - Status Code: ${status_code}`);
    console.log(`  - Status Message: ${status_message}`);
    console.log(`  - Method: ${method}`);

    // Redirect to Flutter web app with payment details
    const redirectUrl = `${
      process.env.FLUTTER_WEB_URL || "http://localhost:8080"
    }/#/payment-success?payment_id=${payment_id}&order_id=${order_id}&amount=${payhere_amount}&status=${status_code}`;

    console.log(`🔄 Redirecting to: ${redirectUrl}`);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("❌ Error handling PayHere return:", error);
    const errorUrl = `${
      process.env.FLUTTER_WEB_URL || "http://localhost:8080"
    }/#/payment-failed?error=return_handler_error`;
    res.redirect(errorUrl);
  }
});

// PayHere cancel URL handler for web payments - no authentication required
router.get("/payhere/cancel", (req, res) => {
  try {
    console.log("🚫 PayHere cancel URL accessed");
    console.log("📋 Query parameters:", req.query);

    // Extract relevant parameters if any
    const { order_id, payment_id } = req.query;

    console.log("🚫 PayHere payment cancelled:");
    console.log(`  - Order ID: ${order_id || "N/A"}`);
    console.log(`  - Payment ID: ${payment_id || "N/A"}`);

    // Redirect to Flutter web app with cancellation details
    const redirectUrl = `${
      process.env.FLUTTER_WEB_URL || "http://localhost:8080"
    }/#/payment-failed?reason=cancelled&order_id=${order_id || ""}&payment_id=${
      payment_id || ""
    }`;

    console.log(`🔄 Redirecting to: ${redirectUrl}`);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("❌ Error handling PayHere cancel:", error);
    const errorUrl = `${
      process.env.FLUTTER_WEB_URL || "http://localhost:8080"
    }/#/payment-failed?error=cancel_handler_error`;
    res.redirect(errorUrl);
  }
});

module.exports = router;
