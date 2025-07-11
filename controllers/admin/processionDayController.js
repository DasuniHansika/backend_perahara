const { query } = require("../../config/database-schema");



const formatDateString = (date) => {
  if (!date) return null;

  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      console.error("Invalid date provided:", date);
      return null;
    }
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return null;
  }
};

/**
 * Helper to log user activity in the activity_logs table
 */
const logActivity = async (
  userId,
  role,
  actionType,
  description,
  affectedEntityId = null,
  entityType = null
) => {
  try {
    await query(
      `INSERT INTO activity_logs 
       (user_id, role, action_type, description, affected_entity_id, entity_type) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, role, actionType, description, affectedEntityId, entityType]
    );
  } catch (error) {
    console.error("Error logging activity:", error);
    // Don't throw the error, just log it to not interrupt flow
  }
};

/**
 * Get all procession days
 */
exports.getAllDays = async (req, res) => {
  try {
    const days = await query(
      `SELECT pd.day_id, pd.date, pd.event_name, pd.description
       FROM procession_days pd
       ORDER BY pd.date ASC`
    );

    // Before returning the response, format all date fields
    const formattedDays = days.map((day) => ({
      ...day,
      date: formatDateString(day.date),
    }));

    return res.status(200).json({
      success: true,
      count: formattedDays.length,
      days: formattedDays,
    });
  } catch (error) {
    console.error("Error fetching procession days:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching procession days",
      error: error.message,
    });
  }
};

/**
 * Get procession day by ID
 */
// exports.getDayById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const [day] = await query(
//       `SELECT pd.day_id, pd.date, pd.event_name, pd.description
//        FROM procession_days pd
//        WHERE pd.day_id = ?`,
//       [id]
//     );

//     if (!day) {
//       return res.status(404).json({
//         success: false,
//         message: "Procession day not found",
//       });
//     }

//     // Get route points for this day
//     const routePoints = await query(
//       `SELECT pr.route_id, pr.latitude, pr.longitude, pr.sequence
//        FROM procession_routes pr
//        WHERE pr.day_id = ?
//        ORDER BY pr.sequence ASC`,
//       [id]
//     );

//     // Get shops available on this day
//     const shops = await query(
//       `SELECT s.shop_id, s.name, s.street, s.latitude, s.longitude,
//               s.image1, s.image2, s.image3, s.image4, s.description,
//               CASE
//                 WHEN EXISTS (
//                   SELECT 1 FROM seat_type_availability sta 
//                   JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
//                   WHERE st.shop_id = s.shop_id AND sta.day_id = ? AND sta.available = TRUE AND sta.quantity > 0
//                 ) THEN TRUE
//                 ELSE FALSE
//               END as has_available_seats,
//               (
//                 SELECT MIN(sta.price)
//                 FROM seat_type_availability sta
//                 JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
//                 WHERE st.shop_id = s.shop_id AND sta.day_id = ? AND sta.available = TRUE AND sta.quantity > 0
//               ) as min_price
//        FROM shops s`,
//       [id, id]
//     );
//     return res.status(200).json({
//       success: true,
//       day: {
//         ...day,
//         date: formatDateString(day.date),
//         routePoints,
//         availableShops: shops,
//       },
//     });
//   } catch (error) {
//     console.error("Error fetching procession day:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching procession day",
//       error: error.message,
//     });
//   }
// };
/**
 * Get procession day by ID with all details
 */
exports.getDayById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get day details
    const [day] = await query(
      `SELECT pd.day_id, pd.date, pd.event_name, pd.description
       FROM procession_days pd
       WHERE pd.day_id = ?`,
      [id]
    );

    if (!day) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Get route points for this day
    const routePoints = await query(
      `SELECT pr.route_id, pr.latitude, pr.longitude, pr.sequence
       FROM procession_routes pr
       WHERE pr.day_id = ?
       ORDER BY pr.sequence ASC`,
      [id]
    );

    // Get shops with detailed availability and seller info
    const shops = await query(
      `SELECT 
        s.shop_id, 
        s.name, 
        s.street, 
        s.latitude, 
        s.longitude,
        s.image1, 
        s.image2, 
        s.image3, 
        s.image4, 
        s.description,
        CONCAT(sellers.first_name, ' ', sellers.last_name) as seller_name,
        sellers.profile_picture as seller_profile,
        sellers.bank_name,
        sellers.bank_account_number,
        COUNT(DISTINCT st.seat_type_id) as seat_types_count,
        SUM(sta.quantity) as total_seats,
        SUM(sta.quantity) - IFNULL((
          SELECT SUM(b.quantity) 
          FROM bookings b
          JOIN seat_types st2 ON b.seat_type_id = st2.seat_type_id
          WHERE st2.shop_id = s.shop_id 
          AND b.day_id = ?
          AND b.status IN ('confirmed', 'paid')
        ), 0) as available_seats,
        MIN(sta.price) as min_price,
        MAX(sta.price) as max_price
      FROM shops s
      JOIN seat_types st ON s.shop_id = st.shop_id
      JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id
      JOIN sellers ON s.seller_id = sellers.seller_id
      WHERE sta.day_id = ? AND sta.available = TRUE
      GROUP BY s.shop_id, s.name, s.street, s.latitude, s.longitude, 
               s.image1, s.image2, s.image3, s.image4, s.description,
               seller_name, seller_profile, sellers.bank_name, 
               sellers.bank_account_number`,
      [id, id]
    );

    // Get seat type details for each shop
    const seatTypes = await query(
      `SELECT 
        st.seat_type_id,
        st.shop_id,
        st.name as seat_type_name,
        st.image_url,
        st.description as seat_description,
        sta.price,
        sta.quantity as total_seats,
        sta.quantity - IFNULL((
          SELECT SUM(b.quantity) 
          FROM bookings b
          WHERE b.seat_type_id = st.seat_type_id 
          AND b.day_id = ?
          AND b.status IN ('confirmed', 'paid')
        ), 0) as available_seats
      FROM seat_types st
      JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id
      WHERE sta.day_id = ? AND sta.available = TRUE
      ORDER BY st.shop_id, sta.price ASC`,
      [id, id]
    );

    // Organize seat types by shop
    const shopsWithSeatTypes = shops.map(shop => {
      return {
        ...shop,
        seat_types: seatTypes.filter(st => st.shop_id === shop.shop_id)
      };
    });

    // Get booking statistics for the day
    const [stats] = await query(
      `SELECT 
        COUNT(DISTINCT b.booking_id) as total_bookings,
        SUM(b.quantity) as total_seats_booked,
        SUM(b.total_price) as total_revenue,
        COUNT(DISTINCT b.customer_id) as unique_customers,
        COUNT(DISTINCT s.shop_id) as shops_with_bookings
      FROM bookings b
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN shops s ON st.shop_id = s.shop_id
      WHERE b.day_id = ? AND b.status IN ('confirmed', 'paid')`,
      [id]
    );

    return res.status(200).json({
      success: true,
      day: {
        ...day,
        date: formatDateString(day.date),
        routePoints,
        stats,
        shops: shopsWithSeatTypes,
      },
    });
  } catch (error) {
    console.error("Error fetching procession day details:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching procession day details",
      error: error.message,
    });
  }
};

/**
 * Create a new procession day (admin only)
 */
// In processionDayController.js - the createDay function is already implemented
// Here's what it does:

/**
 * Create a new procession day (admin only)
 */
exports.createDay = async (req, res) => {
  try {
    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check admin role
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can create procession days",
      });
    }

    const { date, event_name, description } = req.body;

    // Validate required fields
    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required",
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: "Date must be in YYYY-MM-DD format",
      });
    }

    // Check if date already exists
    const [existingDay] = await query(
      "SELECT day_id FROM procession_days WHERE date = ?",
      [date]
    );

    if (existingDay) {
      return res.status(409).json({
        success: false,
        message: "Procession day with this date already exists",
      });
    }

    // Create new procession day
    const result = await query(
      "INSERT INTO procession_days (date, event_name, description) VALUES (?, ?, ?)",
      [date, event_name || null, description || null]
    );

    const dayId = result.insertId;

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_day_created",
      `Created procession day for date ${date} with event name: ${
        event_name || "N/A"
      }`,
      dayId,
      "procession_days"
    );

    return res.status(201).json({
      success: true,
      message: "Procession day created successfully",
      day: {
        day_id: dayId,
        date: formatDateString(date),
        event_name: event_name || null,
        description: description || null,
      },
    });
  } catch (error) {
    console.error("Error creating procession day:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating procession day",
      error: error.message,
    });
  }
};

/**
 * Update a procession day (admin only)
 */
exports.updateDay = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can update procession days",
      });
    }

    const { id } = req.params;
    const { date, event_name, description } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required",
      });
    }

    // Check if the date is valid
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: "Date must be in YYYY-MM-DD format",
      });
    }

    // Check if procession day exists
    const [existingDay] = await query(
      "SELECT date, event_name, description FROM procession_days WHERE day_id = ?",
      [id]
    );

    if (!existingDay) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Check if updating to a date that already exists
    const [dateExists] = await query(
      "SELECT day_id FROM procession_days WHERE date = ? AND day_id != ?",
      [date, id]
    );

    if (dateExists) {
      return res.status(409).json({
        success: false,
        message: "Another procession day with this date already exists",
      });
    }

    // Update the procession day
    await query(
      "UPDATE procession_days SET date = ?, event_name = ?, description = ? WHERE day_id = ?",
      [date, event_name || null, description || null, id]
    );

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_day_updated",
      `Updated procession day from ${existingDay.date} to ${date}, event: ${
        event_name || "N/A"
      }`,
      id,
      "procession_days"
    );
    return res.status(200).json({
      success: true,
      message: "Procession day updated successfully",
      day: {
        day_id: parseInt(id),
        date: formatDateString(date),
        event_name: event_name || null,
        description: description || null,
      },
    });
  } catch (error) {
    console.error("Error updating procession day:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating procession day",
      error: error.message,
    });
  }
};

/**
 * Delete a procession day (admin only)
 */
exports.deleteDay = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can delete procession days",
      });
    }

    const { id } = req.params; // Check if procession day exists
    const [existingDay] = await query(
      "SELECT date, event_name FROM procession_days WHERE day_id = ?",
      [id]
    );

    if (!existingDay) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Check if there are any bookings for this day
    const [bookings] = await query(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE day_id = ?`,
      [id]
    );

    if (bookings.count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: There are ${bookings.count} bookings for this day`,
      });
    }

    // Delete the procession day
    await query("DELETE FROM procession_days WHERE day_id = ?", [id]); // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_day_deleted",
      `Deleted procession day for date ${existingDay.date} - ${
        existingDay.event_name || "No event name"
      }`,
      id,
      "procession_days"
    );

    return res.status(200).json({
      success: true,
      message: "Procession day deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting procession day:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting procession day",
      error: error.message,
    });
  }
};

/**
 * Get shops available on a specific day
 */
exports.getAvailableShops = async (req, res) => {
  try {
    const { id } = req.params;
    const { minSeats } = req.query;

    // Check if procession day exists
    const [day] = await query(
      "SELECT date FROM procession_days WHERE day_id = ?",
      [id]
    );

    if (!day) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Get available shops
    const shops = await query(
      `SELECT 
        s.shop_id, 
        s.name, 
        s.street, 
        s.latitude, 
        s.longitude,
        s.image1, 
        s.image2, 
        s.image3, 
        s.image4, 
        s.description,
        CONCAT(sellers.first_name, ' ', sellers.last_name) as seller_name,
        (SELECT MIN(sta.price)
         FROM seat_type_availability sta
         JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
         WHERE st.shop_id = s.shop_id AND sta.day_id = ? AND sta.available = TRUE
        ) as min_price,
        (SELECT SUM(sta.quantity)
         FROM seat_type_availability sta
         JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
         WHERE st.shop_id = s.shop_id AND sta.day_id = ? AND sta.available = TRUE
        ) as total_available_seats
      FROM shops s
      JOIN sellers ON s.seller_id = sellers.seller_id
      WHERE EXISTS (
        SELECT 1 FROM seat_type_availability sta 
        JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
        WHERE st.shop_id = s.shop_id AND sta.day_id = ? AND sta.available = TRUE
      )
      ORDER BY s.name ASC`,
      [id, id, id]
    );

    return res.status(200).json({
      success: true,
      count: shops.length,
      date: formatDateString(day.date),
      shops,
    });
  } catch (error) {
    console.error("Error fetching available shops:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching available shops",
      error: error.message,
    });
  }
};

/**
 * Task 2: Get procession days formatted for find seats page
 */
exports.getProcessionDays = async (req, res) => {
  try {
    const days = await query(
      `SELECT day_id, date, event_name, description
       FROM procession_days
       ORDER BY date ASC`
    ); // Format response for frontend
    const formattedDays = days.map((day) => {
      return {
        day_id: day.day_id,
        date: formatDateString(day.date),
        event_name: day.event_name || null, // Keep null values as null for proper handling
        description: day.description || null,
      };
    });

    // Add "All Dates" option at the beginning
    const result = [
      { day_id: null, date: null, event_name: "All Dates" },
      ...formattedDays,
    ];

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching procession days:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching procession days",
      error: error.message,
    });
  }
};

/**
 * Task 3: Get streets with shop counts (supports multiple day_ids)
 */
exports.getStreets = async (req, res) => {
  try {
    const { day_id, day_ids } = req.query;

    let sql = `
      SELECT s.street as street_name, COUNT(DISTINCT s.shop_id) as shop_count
      FROM shops s
      WHERE s.street IS NOT NULL AND s.street != ''
    `;

    const params = [];

    // Handle multiple day_ids array or single day_id
    const dayIds = [];
    if (day_ids) {
      // Handle array format day_ids[0], day_ids[1], etc.
      const dayIdKeys = Object.keys(req.query).filter((key) =>
        key.startsWith("day_ids[")
      );
      dayIdKeys.forEach((key) => {
        const dayId = req.query[key];
        if (dayId && dayId !== "null") {
          dayIds.push(dayId);
        }
      });
    } else if (day_id && day_id !== "null") {
      // Handle single day_id for backward compatibility
      dayIds.push(day_id);
    }

    // Filter by days if provided
    if (dayIds.length > 0) {
      const placeholders = dayIds.map(() => "?").join(",");
      sql += `
        AND EXISTS (
          SELECT 1 FROM seat_type_availability sta
          JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
          WHERE st.shop_id = s.shop_id AND sta.day_id IN (${placeholders}) AND sta.available = TRUE
        )
      `;
      params.push(...dayIds);
    }

    sql += `
      GROUP BY s.street
      ORDER BY s.street ASC
    `;

    const streets = await query(sql, params);

    // Add "All Streets" option at the beginning
    const result = [
      {
        street_name: "All Streets",
        shop_count: streets.reduce((sum, s) => sum + s.shop_count, 0),
      },
      ...streets,
    ];

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching streets:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching streets",
      error: error.message,
    });
  }
};

/**
 * Task 4: Get price range for filters (supports multiple day_ids and streets)
 */
exports.getPriceRange = async (req, res) => {
  try {
    const { day_id, street, day_ids, streets } = req.query;

    let sql = `
      SELECT MIN(sta.price) as min_price, MAX(sta.price) as max_price
      FROM seat_type_availability sta
      JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
      JOIN shops s ON st.shop_id = s.shop_id
      WHERE sta.available = TRUE
    `;

    const params = [];

    // Handle multiple day_ids array or single day_id
    const dayIds = [];
    if (day_ids) {
      // Handle array format day_ids[0], day_ids[1], etc.
      const dayIdKeys = Object.keys(req.query).filter((key) =>
        key.startsWith("day_ids[")
      );
      dayIdKeys.forEach((key) => {
        const dayId = req.query[key];
        if (dayId && dayId !== "null") {
          dayIds.push(dayId);
        }
      });
    } else if (day_id && day_id !== "null") {
      // Handle single day_id for backward compatibility
      dayIds.push(day_id);
    }

    // Filter by days if provided
    if (dayIds.length > 0) {
      const placeholders = dayIds.map(() => "?").join(",");
      sql += ` AND sta.day_id IN (${placeholders})`;
      params.push(...dayIds);
    }

    // Handle multiple streets array or single street
    const streetNames = [];
    if (streets) {
      // Handle array format streets[0], streets[1], etc.
      const streetKeys = Object.keys(req.query).filter((key) =>
        key.startsWith("streets[")
      );
      streetKeys.forEach((key) => {
        const streetName = req.query[key];
        if (streetName && streetName !== "All Streets") {
          streetNames.push(streetName);
        }
      });
    } else if (street && street !== "All Streets") {
      // Handle single street for backward compatibility
      streetNames.push(street);
    }

    // Filter by streets if provided
    if (streetNames.length > 0) {
      const placeholders = streetNames.map(() => "?").join(",");
      sql += ` AND s.street IN (${placeholders})`;
      params.push(...streetNames);
    }

    const [result] = await query(sql, params);

    // Handle edge case when no data exists
    const minPrice = result.min_price || 0;
    const maxPrice = result.max_price || 20000;

    return res.status(200).json({
      success: true,
      data: {
        min_price: minPrice,
        max_price: maxPrice,
      },
    });
  } catch (error) {
    console.error("Error fetching price range:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching price range",
      error: error.message,
    });
  }
};

/**
 * Task 5: Search shops with filters (supports multiple day_ids and streets)
 */
exports.searchShops = async (req, res) => {
  try {
    console.log("🔍 [Search Debug] Received query parameters:", req.query);

    const { day_id, street, price_min, price_max, day_ids, streets } =
      req.query;
    let sql = `
      SELECT DISTINCT s.shop_id, s.name, s.street, s.image1,
             s.latitude, s.longitude, s.description,
             MIN(sta.price) as min_price,
             SUM(sta.quantity - COALESCE(
               (SELECT SUM(b.quantity) 
                FROM bookings b 
                WHERE b.seat_type_id = sta.seat_type_id 
                AND b.day_id = sta.day_id 
                AND b.status IN ('confirmed', 'paid')), 0
             )) as available_seats
      FROM shops s
      JOIN seat_types st ON s.shop_id = st.shop_id
      JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id
      WHERE sta.available = TRUE
    `;

    const params = []; // Handle multiple day_ids array or single day_id
    const dayIds = [];
    if (day_ids) {
      // Handle array format day_ids[0], day_ids[1], etc.
      const dayIdKeys = Object.keys(req.query).filter((key) =>
        key.startsWith("day_ids[")
      );
      dayIdKeys.forEach((key) => {
        const dayId = req.query[key];
        if (dayId && dayId !== "null") {
          dayIds.push(dayId);
        }
      });
    } else if (day_id && day_id !== "null") {
      // Handle single day_id for backward compatibility
      dayIds.push(day_id);
    }

    // Also check for array parameters directly (day_ids[0], day_ids[1], etc.)
    Object.keys(req.query).forEach((key) => {
      if (key.startsWith("day_ids[")) {
        const dayId = req.query[key];
        if (dayId && dayId !== "null" && !dayIds.includes(dayId)) {
          dayIds.push(dayId);
        }
      }
    });

    console.log("🔍 [Search Debug] Parsed day IDs:", dayIds);

    // Filter by days if provided
    if (dayIds.length > 0) {
      const placeholders = dayIds.map(() => "?").join(",");
      sql += ` AND sta.day_id IN (${placeholders})`;
      params.push(...dayIds);
    } // Handle multiple streets array or single street
    const streetNames = [];
    if (streets) {
      // Handle array format streets[0], streets[1], etc.
      const streetKeys = Object.keys(req.query).filter((key) =>
        key.startsWith("streets[")
      );
      streetKeys.forEach((key) => {
        const streetName = req.query[key];
        if (streetName && streetName !== "All Streets") {
          streetNames.push(streetName);
        }
      });
    } else if (street && street !== "All Streets") {
      // Handle single street for backward compatibility
      streetNames.push(street);
    }

    // Also check for array parameters directly (streets[0], streets[1], etc.)
    Object.keys(req.query).forEach((key) => {
      if (key.startsWith("streets[")) {
        const streetName = req.query[key];
        if (
          streetName &&
          streetName !== "All Streets" &&
          !streetNames.includes(streetName)
        ) {
          streetNames.push(streetName);
        }
      }
    });

    console.log("🔍 [Search Debug] Parsed street names:", streetNames);

    // Filter by streets if provided
    if (streetNames.length > 0) {
      const placeholders = streetNames.map(() => "?").join(",");
      sql += ` AND s.street IN (${placeholders})`;
      params.push(...streetNames);
    }
    sql += ` GROUP BY s.shop_id, s.name, s.street, s.image1, s.latitude, s.longitude, s.description`;

    // Filter by price range after grouping
    if (price_min !== undefined && price_min !== null) {
      sql += ` HAVING min_price >= ?`;
      params.push(parseFloat(price_min));
    }

    if (price_max !== undefined && price_max !== null) {
      sql += ` ${price_min !== undefined ? "AND" : "HAVING"} min_price <= ?`;
      params.push(parseFloat(price_max));
    }
    sql += ` ORDER BY min_price ASC`;

    console.log("🔍 [Search Debug] Final SQL:", sql);
    console.log("🔍 [Search Debug] Parameters:", params);

    const shops = await query(sql, params);

    console.log(
      `🔍 [Search Debug] Found ${shops.length} shops matching filters`
    );

    // Helper function to generate image URLs
    const generateImageUrl = (req, filePath) => {
      if (!filePath) return null;

      // If filePath is already a full URL, return it as-is
      if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
        return filePath;
      }

      // Check if the filePath contains a full URL within it
      const urlMatch = filePath.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        return urlMatch[1];
      }

      // Construct the URL based on the current request
      const protocol =
        req.headers["x-forwarded-proto"] || req.protocol || "http";
      const host = req.headers["x-forwarded-host"] || req.get("host");
      return `${protocol}://${host}/${filePath}`;
    };

    // Generate full image URLs
    const shopsWithImages = shops.map((shop) => ({
      ...shop,
      image_url: generateImageUrl(req, `uploads/shops/${shop.image1}`),
    }));

    console.log(
      `🔍 [Search Debug] Returning ${shopsWithImages.length} shops with image URLs`
    );

    return res.status(200).json({
      success: true,
      data: shopsWithImages,
    });
  } catch (error) {
    console.error("Error searching shops:", error);
    return res.status(500).json({
      success: false,
      message: "Error searching shops",
      error: error.message,
    });
  }
};
/**
 * Get seat types for a specific shop on a specific day
 */
exports.getShopSeatTypes = async (req, res) => {
  try {
    const { shopId } = req.params;
    const { day_id } = req.query;

    if (!day_id) {
      return res.status(400).json({
        success: false,
        message: "Day ID is required as query parameter"
      });
    }

    const seatTypes = await query(
      `SELECT 
        st.seat_type_id,
        st.name,
        st.image_url,
        st.description,
        sta.price,
        sta.quantity as total_seats,
        sta.quantity - IFNULL((
          SELECT SUM(b.quantity) 
          FROM bookings b
          WHERE b.seat_type_id = st.seat_type_id 
          AND b.day_id = ?
          AND b.status IN ('confirmed', 'paid')
        ), 0) as available_seats,
        sta.available
      FROM seat_types st
      JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id
      WHERE st.shop_id = ? AND sta.day_id = ?
      ORDER BY sta.price ASC`,
      [day_id, shopId, day_id]
    );

    return res.status(200).json({
      success: true,
      seatTypes: seatTypes.map(st => ({
        ...st,
        available: Boolean(st.available),
      })),
    });
  } catch (error) {
    console.error("Error fetching shop seat types:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seat types for this shop",
      error: error.message,
    });
  }
};


