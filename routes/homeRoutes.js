// Home page data routes
const express = require("express");
const router = express.Router();
const {
  verifyFirebaseToken,
  requireUser,
} = require("../middleware/firebaseAuth");
const { query } = require("../config/database-schema");

/**
 * Helper function to format date as YYYY-MM-DD string
 */
const formatDateString = (date) => {
  if (!date) return null;

  // If it's already a string in the correct format, return it
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // If it's a Date object, format it properly
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // For other cases, try to create a Date object and format it
  try {
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error formatting date:", date, error);
    return null;
  }
};

/**
 * @route GET /api/home/event-dates-seats
 * @desc Get event dates with total available seat quantities
 * @access Private (requires authentication)
 */
router.get(
  "/event-dates-seats",
  verifyFirebaseToken,
  requireUser,
  async (req, res) => {
    const startTime = Date.now();

    try {
      console.log(
        `🏠 [HomeRoutes] Event dates seats request from user: ${
          req.user?.uid || "unknown"
        } at ${new Date().toISOString()}`
      );

      // Query to get all procession days with total available seat quantities
      const sqlQuery = `
      SELECT 
        pd.day_id,
        pd.date,
        pd.event_name,
        pd.description,
        pd.color,
        COALESCE(SUM(sta.quantity), 0) as total_available_seats
      FROM procession_days pd
      LEFT JOIN seat_type_availability sta ON pd.day_id = sta.day_id 
        AND sta.available = TRUE 
        AND sta.quantity > 0
      GROUP BY pd.day_id, pd.date, pd.event_name, pd.description, pd.color
      ORDER BY pd.date ASC
    `;

      console.log(`🗃️ [HomeRoutes] Executing query`);

      const rows = await query(sqlQuery);

      console.log(
        `📊 [HomeRoutes] Query completed. Found ${
          rows ? rows.length : 0
        } event dates in ${Date.now() - startTime}ms`
      );

      // Ensure rows is an array and handle empty results
      if (!rows || !Array.isArray(rows)) {
        console.log(`⚠️ [HomeRoutes] No valid rows returned from query`);
        rows = [];
      }

      // Format the response data
      const eventDates = rows.map((row) => ({
        day_id: row.day_id,
        event_date: formatDateString(row.date),
        event_name: row.event_name || null,
        description: row.description || null,
        color: row.color || null,
        total_available_seats: parseInt(row.total_available_seats) || 0,
      }));

      console.log(
        `✅ [HomeRoutes] Successfully formatted ${eventDates.length} event dates`
      );
      console.log(
        `📝 [HomeRoutes] Response data preview:`,
        eventDates.slice(0, 2)
      );

      res.status(200).json({
        success: true,
        message: "Event dates with seat availability retrieved successfully",
        data: {
          event_dates: eventDates,
          total_events: eventDates.length,
        },
        timestamp: new Date().toISOString(),
        request_duration: `${Date.now() - startTime}ms`,
      });
    } catch (error) {
      console.error(`❌ [HomeRoutes] Error in event-dates-seats:`, error);
      console.error(`📍 [HomeRoutes] Error stack:`, error.stack);

      res.status(500).json({
        success: false,
        message: "Failed to retrieve event dates and seat availability",
        error: error.message,
        timestamp: new Date().toISOString(),
        request_duration: `${Date.now() - startTime}ms`,
      });
    }
  }
);

/**
 * @route GET /api/home/event-schedule
 * @desc Get event schedule with only event names and dates (no seat quantities)
 * @access Private (requires authentication)
 */
router.get(
  "/event-schedule",
  verifyFirebaseToken,
  requireUser,
  async (req, res) => {
    const startTime = Date.now();

    try {
      console.log(
        `📅 [HomeRoutes] Event schedule request from user: ${
          req.user?.uid || "unknown"
        } at ${new Date().toISOString()}`
      );

      // Query to get all procession days with just basic event information
      const sqlQuery = `
      SELECT 
        pd.day_id,
        pd.date,
        pd.event_name,
        pd.description,
        pd.color
      FROM procession_days pd
      ORDER BY pd.date ASC
    `;

      console.log(`🗃️ [HomeRoutes] Executing event schedule query`);

      const rows = await query(sqlQuery);

      console.log(
        `📊 [HomeRoutes] Event schedule query completed. Found ${
          rows ? rows.length : 0
        } events in ${Date.now() - startTime}ms`
      );

      // Ensure rows is an array and handle empty results
      if (!rows || !Array.isArray(rows)) {
        console.log(
          `⚠️ [HomeRoutes] No valid rows returned from event schedule query`
        );
        rows = [];
      }

      // Format the response data
      const eventSchedule = rows.map((row) => ({
        day_id: row.day_id,
        event_date: formatDateString(row.date),
        event_name: row.event_name || null,
        description: row.description || null,
        color: row.color || null,
      }));

      console.log(
        `✅ [HomeRoutes] Successfully formatted ${eventSchedule.length} event schedule items`
      );
      console.log(
        `📝 [HomeRoutes] Event schedule response data preview:`,
        eventSchedule.slice(0, 2)
      );

      res.status(200).json({
        success: true,
        message: "Event schedule retrieved successfully",
        data: {
          events: eventSchedule,
          total_events: eventSchedule.length,
        },
        timestamp: new Date().toISOString(),
        request_duration: `${Date.now() - startTime}ms`,
      });
    } catch (error) {
      console.error(`❌ [HomeRoutes] Error in event-schedule:`, error);
      console.error(`📍 [HomeRoutes] Error stack:`, error.stack);

      res.status(500).json({
        success: false,
        message: "Failed to retrieve event schedule",
        error: error.message,
        timestamp: new Date().toISOString(),
        request_duration: `${Date.now() - startTime}ms`,
      });
    }
  }
);

module.exports = router;
