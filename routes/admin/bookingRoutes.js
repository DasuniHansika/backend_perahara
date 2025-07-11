// const express = require("express");
// const router = express.Router();
// const {
//   createBooking,
//   getAllBookings,
//   getBookingById,
//   getBookingsByUserId,
//   getBookingsByShopId,
//   updateBooking,
//   deleteBooking,
//   getBookingsByDateRange,
//   getMyBookings,
//   cancelMyBooking,
//   updateBookingStatus,
//   createDirectBooking
// } = require("../../controllers/admin/bookingController");
// const {
//   verifyFirebaseToken,
//   requireUser,
//   requireRole,
// } = require("../../middleware/firebase_Auth");

// // Create a new booking - requires authentication
// router.post("/", verifyFirebaseToken, requireUser, createBooking);

// // Get all bookings - accessible to admins
// router.get(
//   "/",
//   verifyFirebaseToken,
//   requireUser,
//   requireRole(["admin", "super_admin"]),
//   getAllBookings
// );

// // Get booking by ID - requires authentication
// router.get("/:id", verifyFirebaseToken, requireUser, getBookingById);

// // Get bookings by user ID - requires authentication with permission check in the controller
// router.get(
//   "/user/:userId",
//   verifyFirebaseToken,
//   requireUser,
//   getBookingsByUserId
// );

// // Get my bookings (current user)
// router.get(
//   "/my-bookings",
//   verifyFirebaseToken,
//   requireUser,
//   getMyBookings
// );

// // Get bookings by shop ID - requires authentication
// router.get(
//   "/shop/:shopId",
//   verifyFirebaseToken,
//   requireUser,
//   getBookingsByShopId
// );

// // Get bookings by date range - requires authentication
// router.get(
//   "/date-range",
//   verifyFirebaseToken,
//   requireUser,
//   getBookingsByDateRange
// );

// // Update booking - requires authentication with permission check in the controller
// router.put("/:id", verifyFirebaseToken, requireUser, updateBooking);

// // Update booking status
// router.put("/:id/status", verifyFirebaseToken, requireUser, updateBookingStatus);

// // Delete booking - requires authentication with permission check in the controller
// router.delete("/:id", verifyFirebaseToken, requireUser, deleteBooking);

// // Cancel my booking (customer only)
// router.delete("/:id/cancel", verifyFirebaseToken, requireUser, cancelMyBooking);
// // Add this route before module.exports
// router.post(
//   "/direct",
//   verifyFirebaseToken,
//   requireUser,
//   createDirectBooking
// );

// module.exports = router;
const express = require("express");
const router = express.Router();
const {
  createBooking,
  getAllBookings,
  getBookingById,
  getBookingsByUserId,
  getBookingsByShopId,
  updateBooking,
  deleteBooking,
  getBookingsByDateRange,
  createDirectBooking,
} = require("../../controllers/admin/bookingController");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
} = require("../../middleware/firebaseAuth");

// Create a new booking - requires authentication
router.post("/", verifyFirebaseToken, requireUser, createBooking);

// Get all bookings - accessible to admins
router.get(
  "/",
  verifyFirebaseToken,
  requireUser,
  requireRole(["admin", "super_admin"]),
  getAllBookings
);

// Get booking by ID - requires authentication
router.get("/:id", verifyFirebaseToken, requireUser, getBookingById);

// Get bookings by user ID - requires authentication with permission check in the controller
router.get(
  "/user/:userId",
  verifyFirebaseToken,
  requireUser,
  getBookingsByUserId
);

// Get bookings by shop ID - requires authentication
router.get(
  "/shop/:shopId",
  verifyFirebaseToken,
  requireUser,
  getBookingsByShopId
);

// Get bookings by date range - requires authentication
router.get(
  "/date-range",
  verifyFirebaseToken,
  requireUser,
  getBookingsByDateRange
);

// Update booking - requires authentication with permission check in the controller
router.put("/:id", verifyFirebaseToken, requireUser, updateBooking);

// Delete booking - requires authentication with permission check in the controller
router.delete("/:id", verifyFirebaseToken, requireUser, deleteBooking);
 router.post(
  "/direct",
  verifyFirebaseToken,
  requireUser,
  createDirectBooking
);
module.exports = router;
