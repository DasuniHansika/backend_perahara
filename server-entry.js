// Main server entry point with database initialization
require("dotenv").config();

// Suppress punycode deprecation warning until firebase-admin dependencies are updated
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (typeof warning === "string" && warning.includes("punycode")) {
    return; // Skip punycode deprecation warnings
  }
  return originalEmitWarning.call(process, warning, ...args);
};

const app = require("./application");
const { initializeDatabase } = require("./config/database-schema");
const { scheduleCleanup } = require("./utils/emailVerificationCleanup");
const {
  scheduleBookingMaintenance,
} = require("./services/bookingExpirationService");

const PORT = parseInt(process.env.PORT) || 3000;

// Global error handlers to prevent server termination
process.on("uncaughtException", (error) => {
  console.error(
    "🚨 [UncaughtException] Server error occurred but continuing to run:",
    error
  );
  console.error("Stack trace:", error.stack);
  // Don't exit the process, just log the error
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "🚨 [UnhandledRejection] Unhandled promise rejection but continuing to run:",
    reason
  );
  console.error("Promise:", promise);
  // Don't exit the process, just log the error
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize the database with the new schema
    await initializeDatabase();
    console.log("Database initialized successfully");

    // Schedule booking maintenance tasks (expiration, failed payments, seat restoration)
    scheduleBookingMaintenance();

    // NOTE: Email verification cleanup has been disabled as requested
    // Schedule email verification cleanup (every 6 hours)
    // scheduleCleanup(6);

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

startServer();
