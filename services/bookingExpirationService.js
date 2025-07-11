// services/bookingExpirationService.js
const { query } = require("../config/database-schema");
const cron = require("node-cron");

/**
 * Ensure database connection is properly set up
 */
const ensureDatabaseConnection = async () => {
  try {
    await query(`USE ${process.env.DB_NAME || "gallery"}`);
  } catch (error) {
    console.error("Failed to select database:", error);
    throw error;
  }
};

/**
 * Helper function to validate if a user exists
 * @param {number} userId - The user ID to validate
 * @param {number} bookingId - The booking ID for logging purposes
 * @returns {Promise<boolean>} - True if user exists, false otherwise
 */
const validateUserExists = async (userId, bookingId) => {
  try {
    const userExists = await query(
      "SELECT user_id FROM users WHERE user_id = ?",
      [userId]
    );

    if (userExists.length === 0) {
      console.warn(
        `Orphaned booking ${bookingId} detected - user_id ${userId} doesn't exist in users table`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      `Error validating user ${userId} for booking ${bookingId}:`,
      error
    );
    return false;
  }
};

/**
 * Safely log activity with user validation
 * @param {number} userId - User ID
 * @param {string} actionType - Action type
 * @param {string} description - Description
 * @param {number} bookingId - Booking ID
 */
const safeLogActivity = async (userId, actionType, description, bookingId) => {
  try {
    const userExists = await validateUserExists(userId, bookingId);

    if (userExists) {
      await query(
        `
        INSERT INTO activity_logs 
        (user_id, role, action_type, description, affected_entity_id, entity_type)
        VALUES (?, 'customer', ?, ?, ?, 'booking')
      `,
        [userId, actionType, description, bookingId]
      );
    } else {
      console.warn(
        `Skipping activity log for orphaned booking ${bookingId} (user_id ${userId} not found)`
      );
    }
  } catch (logError) {
    console.error(`Failed to log activity for booking ${bookingId}:`, logError);
    // Continue processing even if logging fails
  }
};

/**
 * Check and expire pending bookings without payments
 */
const expirePendingBookings = async () => {
  try {
    await ensureDatabaseConnection();
    console.log("Checking for expired pending bookings...");

    // Find expired pending bookings without payments - Use customer_id (actual DB field)
    const expiredBookings = await query(`
      SELECT b.booking_id, b.seat_type_id, b.day_id, b.quantity, b.customer_id
      FROM bookings b
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      WHERE b.status = 'pending' 
      AND b.expires_at IS NOT NULL
      AND b.expires_at <= NOW()
      AND p.payment_id IS NULL
    `);

    if (expiredBookings.length === 0) {
      return 0;
    }

    console.log(`Found ${expiredBookings.length} expired pending bookings`);

    for (const booking of expiredBookings) {
      // Update booking status to expired
      await query(
        "UPDATE bookings SET status = ?, updated_at = NOW() WHERE booking_id = ?",
        ["expired", booking.booking_id]
      );

      // Immediately restore seat quantity for expired booking
      await query(
        `
        UPDATE seat_type_availability 
        SET quantity = quantity + ?
        WHERE seat_type_id = ? AND day_id = ?
      `,
        [booking.quantity, booking.seat_type_id, booking.day_id]
      );

      // Log the expiration activity - Use customer_id as it represents user_id
      await safeLogActivity(
        booking.customer_id, // customer_id contains user_id in the migrated system
        "booking_expired",
        `Booking expired automatically - ${booking.quantity} seats restored`,
        booking.booking_id
      );

      console.log(
        `Expired booking ${booking.booking_id} and immediately restored ${booking.quantity} seats`
      );
    }

    console.log(
      `Expired ${expiredBookings.length} pending bookings and restored seat quantities`
    );
    return expiredBookings.length;
  } catch (error) {
    console.error("Error expiring pending bookings:", error);
    throw error;
  }
};

/**
 * Handle failed payments by cancelling related bookings
 */
const handleFailedPayments = async () => {
  try {
    await ensureDatabaseConnection();
    console.log("Checking for failed payments...");

    // Find bookings with failed payments that haven't been cancelled yet - Use customer_id
    const failedPaymentBookings = await query(`
      SELECT DISTINCT b.booking_id, b.seat_type_id, b.day_id, b.quantity, b.customer_id
      FROM bookings b
      JOIN payments p ON b.booking_id = p.booking_id
      WHERE p.status = 'failed' 
      AND b.status NOT IN ('cancelled', 'expired')
    `);

    if (failedPaymentBookings.length === 0) {
      return 0;
    }

    console.log(
      `Found ${failedPaymentBookings.length} bookings with failed payments`
    );

    for (const booking of failedPaymentBookings) {
      // Update booking status to cancelled
      await query(
        "UPDATE bookings SET status = ?, updated_at = NOW() WHERE booking_id = ?",
        ["cancelled", booking.booking_id]
      );

      // Immediately restore seat quantity for cancelled booking
      await query(
        `
        UPDATE seat_type_availability 
        SET quantity = quantity + ?
        WHERE seat_type_id = ? AND day_id = ?
      `,
        [booking.quantity, booking.seat_type_id, booking.day_id]
      );

      // Log the cancellation activity - Use customer_id as it represents user_id
      await safeLogActivity(
        booking.customer_id, // customer_id contains user_id in the migrated system
        "booking_cancelled_failed_payment",
        `Booking cancelled due to failed payment - ${booking.quantity} seats restored`,
        booking.booking_id
      );

      console.log(
        `Cancelled booking ${booking.booking_id} due to failed payment and immediately restored ${booking.quantity} seats`
      );
    }

    console.log(
      `Cancelled ${failedPaymentBookings.length} bookings with failed payments and restored seat quantities`
    );
    return failedPaymentBookings.length;
  } catch (error) {
    console.error("Error handling failed payments:", error);
    throw error;
  }
};

/**
 * Ensure seat quantities are immediately restored for expired and cancelled bookings
 */
const restoreSeatQuantities = async () => {
  try {
    await ensureDatabaseConnection();
    console.log(
      "Checking for expired/cancelled bookings needing seat restoration..."
    );

    // Find expired/cancelled bookings that may need seat quantity restoration - Use customer_id
    // This serves as a safety net in case immediate restoration failed
    const bookingsToRestore = await query(`
      SELECT b.booking_id, b.seat_type_id, b.day_id, b.quantity, b.customer_id, b.status
      FROM bookings b
      WHERE b.status IN ('expired', 'cancelled')
      AND b.booking_id NOT IN (
        SELECT DISTINCT affected_entity_id 
        FROM activity_logs 
        WHERE action_type IN ('booking_expired', 'booking_cancelled_failed_payment', 'seat_quantity_restored')
        AND entity_type = 'booking'
        AND affected_entity_id IS NOT NULL
      )
    `);

    if (bookingsToRestore.length === 0) {
      return 0;
    }

    console.log(
      `Found ${bookingsToRestore.length} expired/cancelled bookings needing seat quantity restoration`
    );

    for (const booking of bookingsToRestore) {
      // Immediately restore seat quantity
      await query(
        `
        UPDATE seat_type_availability 
        SET quantity = quantity + ?
        WHERE seat_type_id = ? AND day_id = ?
      `,
        [booking.quantity, booking.seat_type_id, booking.day_id]
      );

      // Log the restoration - Use customer_id as it represents user_id
      await safeLogActivity(
        booking.customer_id, // customer_id contains user_id in the migrated system
        "seat_quantity_restored",
        `Restored ${booking.quantity} seats for ${booking.status} booking ${booking.booking_id}`,
        booking.booking_id
      );

      console.log(
        `Restored ${booking.quantity} seats for ${booking.status} booking ${booking.booking_id}`
      );
    }

    console.log(
      `Restored seat quantities for ${bookingsToRestore.length} bookings`
    );
    return bookingsToRestore.length;
  } catch (error) {
    console.error("Error restoring seat quantities:", error);
    throw error;
  }
};

/**
 * Synchronize payment expires_at with booking expires_at
 * Ensures payments expire 5 minutes after their updated_at timestamp
 */
const synchronizePaymentExpiration = async () => {
  try {
    await ensureDatabaseConnection();
    console.log("Synchronizing payment expiration times with bookings...");

    // Update payments table expires_at based on bookings expires_at
    // Only for pending payments that don't have expires_at set or are out of sync
    const updateResult = await query(`
      UPDATE payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      SET p.expires_at = b.expires_at
      WHERE p.status = 'pending'
      AND b.expires_at IS NOT NULL
      AND (p.expires_at IS NULL OR p.expires_at != b.expires_at)
    `);

    // Also ensure payments have a 5-minute expiration from their updated_at if no booking expiration exists
    const updatePendingResult = await query(`
      UPDATE payments p
      LEFT JOIN bookings b ON p.booking_id = b.booking_id
      SET p.expires_at = DATE_ADD(p.updated_at, INTERVAL 5 MINUTE)
      WHERE p.status = 'pending'
      AND p.expires_at IS NULL
      AND (b.expires_at IS NULL OR b.expires_at > DATE_ADD(p.updated_at, INTERVAL 5 MINUTE))
    `);

    const totalUpdated =
      updateResult.affectedRows + updatePendingResult.affectedRows;
    if (totalUpdated > 0) {
      console.log(`Synchronized expiration for ${totalUpdated} payments`);
    }

    return totalUpdated;
  } catch (error) {
    console.error("Error synchronizing payment expiration:", error);
    throw error;
  }
};

/**
 * Handle expired payments by marking them as failed and cancelling related bookings
 */
const handleExpiredPayments = async () => {
  try {
    await ensureDatabaseConnection();
    console.log("Checking for expired payments...");

    // Find expired pending payments
    const expiredPayments = await query(`
      SELECT DISTINCT p.payment_id, p.booking_id, b.seat_type_id, b.day_id, b.quantity, b.customer_id
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      WHERE p.status = 'pending' 
      AND p.expires_at IS NOT NULL
      AND p.expires_at <= NOW()
    `);

    if (expiredPayments.length === 0) {
      return 0;
    }

    console.log(`Found ${expiredPayments.length} expired payments`);

    for (const payment of expiredPayments) {
      // Mark payment as failed
      await query(
        "UPDATE payments SET status = ?, updated_at = NOW() WHERE payment_id = ?",
        ["failed", payment.payment_id]
      );

      // Note: Booking cancellation and seat restoration will be handled by handleFailedPayments()

      // Log the payment expiration activity
      await safeLogActivity(
        payment.customer_id,
        "payment_expired",
        `Payment expired for booking ${payment.booking_id}`,
        payment.booking_id
      );

      console.log(
        `Expired payment ${payment.payment_id} - booking cancellation and seat restoration will be handled by failed payment process`
      );
    }

    console.log(
      `Processed ${expiredPayments.length} expired payments - booking cancellation and seat restoration handled by failed payment process`
    );
    return expiredPayments.length;
  } catch (error) {
    console.error("Error handling expired payments:", error);
    throw error;
  }
};

/**
 * Run all booking maintenance tasks
 */
const runBookingMaintenance = async () => {
  try {
    console.log("=== Starting booking maintenance ===");

    // Handle expired payments (this will also cancel bookings and restore seats)
    const expiredPaymentCount = await handleExpiredPayments();

    // Handle expired pending bookings without payments
    const expiredCount = await expirePendingBookings();

    // Handle bookings with failed payments
    const failedCount = await handleFailedPayments();

    // Restore any remaining seat quantities as a safety net
    const restoredCount = await restoreSeatQuantities();

    const totalProcessed =
      expiredCount + failedCount + restoredCount + expiredPaymentCount;

    if (totalProcessed > 0) {
      console.log(
        `=== Booking maintenance completed: ${expiredPaymentCount} expired payments handled, ${expiredCount} expired bookings, ${failedCount} failed payments handled, ${restoredCount} quantities restored ===`
      );
    } else {
      console.log("=== Booking maintenance completed: No actions needed ===");
    }

    return {
      expiredCount,
      failedCount,
      restoredCount,
      expiredPaymentCount,
      totalProcessed,
    };
  } catch (error) {
    console.error("Error in booking maintenance:", error);
    throw error;
  }
};

/**
 * Schedule booking maintenance tasks
 */
const scheduleBookingMaintenance = () => {
  // Run every 2 minutes for more frequent maintenance
  cron.schedule("*/2 * * * *", async () => {
    try {
      await runBookingMaintenance();
    } catch (error) {
      console.error("Error in scheduled booking maintenance:", error);
    }
  });

  // Also run every hour as a backup
  cron.schedule("0 * * * *", async () => {
    try {
      console.log("=== Running hourly booking maintenance backup ===");
      await runBookingMaintenance();
    } catch (error) {
      console.error("Error in hourly booking maintenance:", error);
    }
  });

  console.log("✅ Booking maintenance scheduler started");
  console.log("   - Running every 2 minutes for comprehensive maintenance");
  console.log("   - Running every hour as backup maintenance");

  // Run once immediately on startup
  setTimeout(async () => {
    try {
      console.log("=== Running initial booking maintenance on startup ===");
      await runBookingMaintenance();
    } catch (error) {
      console.error("Error in initial booking maintenance:", error);
    }
  }, 10000); // Wait 10 seconds after startup
};

module.exports = {
  expirePendingBookings,
  handleFailedPayments,
  restoreSeatQuantities,
  handleExpiredPayments,
  runBookingMaintenance,
  scheduleBookingMaintenance,
};
