// routes/customerTicketsRoutes.js
const express = require("express");
const router = express.Router();
const {
  getCustomerTicketById,
  getCustomerTickets,
  getAllCustomerTickets,
  resendTicketEmail,
  getTicketDetailsByUserAndNumber,
  getUniqueCustomerTickets,
} = require("../controllers/customerTicketsController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../middleware/firebaseAuth");

// Get all customer tickets - admin only
router.get(
  "/",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  getAllCustomerTickets
);

// Get customer tickets by customer ID or current user's tickets
router.get(
  "/customer/:customerId",
  verifyFirebaseToken,
  requireUser,
  requireRole(["customer", "admin", "super_admin"]),
  getCustomerTickets
);

// Get current user's customer tickets (no customerId required)
router.get(
  "/customer",
  verifyFirebaseToken,
  requireUser,
  requireRole(["customer", "admin", "super_admin"]),
  getCustomerTickets
);

// Get current user's unique customer tickets (grouped by ticket_no)
router.get(
  "/customer/unique",
  verifyFirebaseToken,
  requireUser,
  requireRole(["customer", "admin", "super_admin"]),
  getUniqueCustomerTickets
);

// Get detailed ticket information by user ID and ticket number
router.get(
  "/user/:userId/ticket/:ticketNumber",
  verifyFirebaseToken,
  requireUser,
  requireRole(["customer", "admin", "super_admin"]),
  getTicketDetailsByUserAndNumber
);

// Get specific ticket by ID
router.get(
  "/:ticketId",
  verifyFirebaseToken,
  requireUser,
  getCustomerTicketById
);

// Resend ticket email
router.post(
  "/:ticketId/resend-email",
  verifyFirebaseToken,
  requireUser,
  resendTicketEmail
);

module.exports = router;
