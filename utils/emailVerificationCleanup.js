// utils/emailVerificationCleanup.js
const { admin } = require("../config/firebase");
const { query } = require("../config/database-schema");

// Email verification expiration time (24 hours in milliseconds)
const EMAIL_VERIFICATION_EXPIRY = 24 * 60 * 60 * 1000;

/**
 * Clean up unverified users older than the expiration time
 */
const cleanupUnverifiedUsers = async () => {
  try {
    console.log("Starting cleanup of unverified users...");

    // Get all Firebase users
    const listUsersResult = await admin.auth().listUsers();
    const now = new Date();
    let deletedCount = 0;

    for (const userRecord of listUsersResult.users) {
      // Check if user is not verified and account is older than expiry time
      if (!userRecord.emailVerified && userRecord.metadata.creationTime) {
        const creationTime = new Date(userRecord.metadata.creationTime);
        const timeDiff = now.getTime() - creationTime.getTime();

        if (timeDiff > EMAIL_VERIFICATION_EXPIRY) {
          try {
            // Delete from our database first (if exists)
            await query("DELETE FROM users WHERE firebase_uid = ?", [
              userRecord.uid,
            ]);

            // Delete from Firebase Auth
            await admin.auth().deleteUser(userRecord.uid);

            deletedCount++;
            console.log(
              `Deleted unverified user: ${userRecord.email} (created: ${creationTime})`
            );
          } catch (deleteError) {
            console.error(
              `Error deleting user ${userRecord.email}:`,
              deleteError
            );
          }
        }
      }
    }

    console.log(`Cleanup completed. Deleted ${deletedCount} unverified users.`);
    return deletedCount;
  } catch (error) {
    console.error("Error during unverified users cleanup:", error);
    throw error;
  }
};

/**
 * Schedule periodic cleanup of unverified users
 * @param {number} intervalHours - Cleanup interval in hours (default: 6 hours)
 */
const scheduleCleanup = (intervalHours = 6) => {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  // Run cleanup immediately
  cleanupUnverifiedUsers().catch((error) => {
    console.error("Initial cleanup failed:", error);
  });

  // Schedule periodic cleanup
  setInterval(() => {
    cleanupUnverifiedUsers().catch((error) => {
      console.error("Scheduled cleanup failed:", error);
    });
  }, intervalMs);

  console.log(
    `Email verification cleanup scheduled every ${intervalHours} hours`
  );
};

/**
 * Manually trigger cleanup (for testing or manual execution)
 */
const triggerCleanup = async () => {
  try {
    const deletedCount = await cleanupUnverifiedUsers();
    return {
      success: true,
      message: `Successfully deleted ${deletedCount} unverified users`,
      deletedCount,
    };
  } catch (error) {
    return {
      success: false,
      message: "Cleanup failed",
      error: error.message,
    };
  }
};

module.exports = {
  cleanupUnverifiedUsers,
  scheduleCleanup,
  triggerCleanup,
  EMAIL_VERIFICATION_EXPIRY,
};
