// controllers/processionRouteController.js
const { query } = require("../../config/database-schema");


exports.getRouteByDayId = async (req, res) => {
  try {
    const { dayId } = req.params;

    // Check if procession day exists
    const [day] = await query(
      "SELECT date FROM procession_days WHERE day_id = ?",
      [dayId]
    );

    if (!day) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Get route points
    const routePoints = await query(
      `SELECT route_id, latitude, longitude, sequence
       FROM procession_routes
       WHERE day_id = ?
       ORDER BY sequence ASC`,
      [dayId]
    );

    return res.status(200).json({
      success: true,
      count: routePoints.length,
      date: day.date,
      routes: routePoints,
    });
  } catch (error) {
    console.error("Error fetching procession route:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching procession route",
      error: error.message,
    });
  }
};

/**
 * Create or update route points for a specific day (admin only)
 */
exports.upsertRoute = async (req, res) => {
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
        message: "Only admins can update procession routes",
      });
    }

    const { dayId } = req.params;
    const { routes } = req.body;

    if (!routes || !Array.isArray(routes) || routes.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Routes array is required and must not be empty",
      });
    }

    // Validate each route point
    for (const point of routes) {
      if (!point.latitude || !point.longitude || !point.sequence) {
        return res.status(400).json({
          success: false,
          message:
            "Each route point must have latitude, longitude, and sequence",
        });
      }
    }

    // Check if procession day exists
    const [day] = await query(
      "SELECT date FROM procession_days WHERE day_id = ?",
      [dayId]
    );

    if (!day) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Start transaction
    await beginTransaction();

    try {
      // Delete existing route points for this day
      await query("DELETE FROM procession_routes WHERE day_id = ?", [dayId]);

      // Insert new route points
      for (const point of routes) {
        await query(
          `INSERT INTO procession_routes (day_id, latitude, longitude, sequence)
           VALUES (?, ?, ?, ?)`,
          [dayId, point.latitude, point.longitude, point.sequence]
        );
      }

      // Log the activity
      await logActivity(
        req.user.id,
        req.user.role,
        "procession_route_updated",
        `Updated procession route for day ${day.date} with ${routes.length} points`,
        dayId,
        "procession_routes"
      );

      // Commit transaction
      await commitTransaction();

      // Get the newly inserted route points
      const updatedRoute = await query(
        `SELECT route_id, latitude, longitude, sequence
         FROM procession_routes
         WHERE day_id = ?
         ORDER BY sequence ASC`,
        [dayId]
      );

      return res.status(200).json({
        success: true,
        message: "Procession route updated successfully",
        count: updatedRoute.length,
        routes: updatedRoute,
      });
    } catch (error) {
      // Rollback transaction if something goes wrong
      await rollbackTransaction();
      throw error;
    }
  } catch (error) {
    console.error("Error updating procession route:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating procession route",
      error: error.message,
    });
  }
};

/**
 * Add a single point to a procession route (admin only)
 */
exports.addRoutePoint = async (req, res) => {
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
        message: "Only admins can add route points",
      });
    }

    const { dayId } = req.params;
    const { latitude, longitude, sequence } = req.body;

    if (!latitude || !longitude || sequence === undefined) {
      return res.status(400).json({
        success: false,
        message: "Latitude, longitude, and sequence are required",
      });
    }

    // Check if procession day exists
    const [day] = await query(
      "SELECT date FROM procession_days WHERE day_id = ?",
      [dayId]
    );

    if (!day) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Add the new route point
    const result = await query(
      `INSERT INTO procession_routes (day_id, latitude, longitude, sequence)
       VALUES (?, ?, ?, ?)`,
      [dayId, latitude, longitude, sequence]
    );

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_route_point_added",
      `Added route point (${latitude}, ${longitude}) at sequence ${sequence} for day ${day.date}`,
      result.insertId,
      "procession_routes"
    );

    return res.status(201).json({
      success: true,
      message: "Route point added successfully",
      point: {
        route_id: result.insertId,
        day_id: parseInt(dayId),
        latitude,
        longitude,
        sequence,
      },
    });
  } catch (error) {
    console.error("Error adding route point:", error);
    return res.status(500).json({
      success: false,
      message: "Error adding route point",
      error: error.message,
    });
  }
};

/**
 * Update a single point in a procession route (admin only)
 */
exports.updateRoutePoint = async (req, res) => {
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
        message: "Only admins can update route points",
      });
    }

    const { id } = req.params;
    const { latitude, longitude, sequence } = req.body;

    // Check if at least one field to update is provided
    if (
      latitude === undefined &&
      longitude === undefined &&
      sequence === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one of latitude, longitude, or sequence must be provided",
      });
    }

    // Check if route point exists
    const [routePoint] = await query(
      `SELECT pr.route_id, pr.day_id, pr.latitude, pr.longitude, pr.sequence, pd.date
       FROM procession_routes pr
       JOIN procession_days pd ON pr.day_id = pd.day_id
       WHERE pr.route_id = ?`,
      [id]
    );

    if (!routePoint) {
      return res.status(404).json({
        success: false,
        message: "Route point not found",
      });
    }

    // Build update query
    const updates = {};
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (sequence !== undefined) updates.sequence = sequence;

    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(", ");

    const values = Object.values(updates);
    values.push(id);

    // Update the route point
    await query(
      `UPDATE procession_routes SET ${setClause} WHERE route_id = ?`,
      values
    );

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_route_point_updated",
      `Updated route point for day ${routePoint.date}`,
      id,
      "procession_routes"
    );

    // Get the updated route point
    const [updatedPoint] = await query(
      "SELECT route_id, day_id, latitude, longitude, sequence FROM procession_routes WHERE route_id = ?",
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Route point updated successfully",
      point: updatedPoint,
    });
  } catch (error) {
    console.error("Error updating route point:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating route point",
      error: error.message,
    });
  }
};

/**
 * Delete a single point from a procession route (admin only)
 */
exports.deleteRoutePoint = async (req, res) => {
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
        message: "Only admins can delete route points",
      });
    }

    const { id } = req.params;

    // Check if route point exists
    const [routePoint] = await query(
      `SELECT pr.route_id, pr.day_id, pr.latitude, pr.longitude, pr.sequence, pd.date
       FROM procession_routes pr
       JOIN procession_days pd ON pr.day_id = pd.day_id
       WHERE pr.route_id = ?`,
      [id]
    );

    if (!routePoint) {
      return res.status(404).json({
        success: false,
        message: "Route point not found",
      });
    }

    // Delete the route point
    await query("DELETE FROM procession_routes WHERE route_id = ?", [id]);

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_route_point_deleted",
      `Deleted route point (${routePoint.latitude}, ${routePoint.longitude}) at sequence ${routePoint.sequence} for day ${routePoint.date}`,
      id,
      "procession_routes"
    );

    return res.status(200).json({
      success: true,
      message: "Route point deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting route point:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting route point",
      error: error.message,
    });
  }
};

/**
 * Clear all route points for a specific day (admin only)
 */
exports.clearRoute = async (req, res) => {
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
        message: "Only admins can clear routes",
      });
    }

    const { dayId } = req.params;

    // Check if procession day exists
    const [day] = await query(
      "SELECT date FROM procession_days WHERE day_id = ?",
      [dayId]
    );

    if (!day) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Count how many points we're deleting for logging
    const [countResult] = await query(
      "SELECT COUNT(*) as count FROM procession_routes WHERE day_id = ?",
      [dayId]
    );

    // Delete all route points for this day
    await query("DELETE FROM procession_routes WHERE day_id = ?", [dayId]);

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_route_cleared",
      `Cleared procession route for day ${day.date} (${countResult.count} points removed)`,
      dayId,
      "procession_routes"
    );

    return res.status(200).json({
      success: true,
      message: `Route cleared successfully. ${countResult.count} points removed.`,
    });
  } catch (error) {
    console.error("Error clearing route:", error);
    return res.status(500).json({
      success: false,
      message: "Error clearing route",
      error: error.message,
    });
  }
};






//mobile 

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
 * Helper to begin a transaction
 */
const beginTransaction = () => {
  return query("START TRANSACTION");
};

/**
 * Helper to commit a transaction
 */
const commitTransaction = () => {
  return query("COMMIT");
};

/**
 * Helper to rollback a transaction
 */
const rollbackTransaction = () => {
  return query("ROLLBACK");
};

/**
 * Get procession route for a specific day
 */
exports.getRouteByDayId = async (req, res) => {
  try {
    const { dayId } = req.params;

    // Check if procession day exists
    const [day] = await query(
      "SELECT date FROM procession_days WHERE day_id = ?",
      [dayId]
    );

    if (!day) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Get route points
    const routePoints = await query(
      `SELECT route_id, latitude, longitude, sequence
       FROM procession_routes
       WHERE day_id = ?
       ORDER BY sequence ASC`,
      [dayId]
    );
    return res.status(200).json({
      success: true,
      count: routePoints.length,
      date: formatDateString(day.date),
      routes: routePoints,
    });
  } catch (error) {
    console.error("Error fetching procession route:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching procession route",
      error: error.message,
    });
  }
};

/**
 * Create or update route points for a specific day (admin only)
 */
exports.upsertRoute = async (req, res) => {
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
        message: "Only admins can update procession routes",
      });
    }

    const { dayId } = req.params;
    const { routes } = req.body;

    if (!routes || !Array.isArray(routes) || routes.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Routes array is required and must not be empty",
      });
    }

    // Validate each route point
    for (const point of routes) {
      if (!point.latitude || !point.longitude || !point.sequence) {
        return res.status(400).json({
          success: false,
          message:
            "Each route point must have latitude, longitude, and sequence",
        });
      }
    }

    // Check if procession day exists
    const [day] = await query(
      "SELECT date FROM procession_days WHERE day_id = ?",
      [dayId]
    );

    if (!day) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Start transaction
    await beginTransaction();

    try {
      // Delete existing route points for this day
      await query("DELETE FROM procession_routes WHERE day_id = ?", [dayId]);

      // Insert new route points
      for (const point of routes) {
        await query(
          `INSERT INTO procession_routes (day_id, latitude, longitude, sequence)
           VALUES (?, ?, ?, ?)`,
          [dayId, point.latitude, point.longitude, point.sequence]
        );
      }

      // Log the activity
      await logActivity(
        req.user.id,
        req.user.role,
        "procession_route_updated",
        `Updated procession route for day ${day.date} with ${routes.length} points`,
        dayId,
        "procession_routes"
      );

      // Commit transaction
      await commitTransaction();

      // Get the newly inserted route points
      const updatedRoute = await query(
        `SELECT route_id, latitude, longitude, sequence
         FROM procession_routes
         WHERE day_id = ?
         ORDER BY sequence ASC`,
        [dayId]
      );

      return res.status(200).json({
        success: true,
        message: "Procession route updated successfully",
        count: updatedRoute.length,
        routes: updatedRoute,
      });
    } catch (error) {
      // Rollback transaction if something goes wrong
      await rollbackTransaction();
      throw error;
    }
  } catch (error) {
    console.error("Error updating procession route:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating procession route",
      error: error.message,
    });
  }
};

/**
 * Add a single point to a procession route (admin only)
 */
exports.addRoutePoint = async (req, res) => {
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
        message: "Only admins can add route points",
      });
    }

    const { dayId } = req.params;
    const { latitude, longitude, sequence } = req.body;

    if (!latitude || !longitude || sequence === undefined) {
      return res.status(400).json({
        success: false,
        message: "Latitude, longitude, and sequence are required",
      });
    }

    // Check if procession day exists
    const [day] = await query(
      "SELECT date FROM procession_days WHERE day_id = ?",
      [dayId]
    );

    if (!day) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Add the new route point
    const result = await query(
      `INSERT INTO procession_routes (day_id, latitude, longitude, sequence)
       VALUES (?, ?, ?, ?)`,
      [dayId, latitude, longitude, sequence]
    );

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_route_point_added",
      `Added route point (${latitude}, ${longitude}) at sequence ${sequence} for day ${day.date}`,
      result.insertId,
      "procession_routes"
    );

    return res.status(201).json({
      success: true,
      message: "Route point added successfully",
      point: {
        route_id: result.insertId,
        day_id: parseInt(dayId),
        latitude,
        longitude,
        sequence,
      },
    });
  } catch (error) {
    console.error("Error adding route point:", error);
    return res.status(500).json({
      success: false,
      message: "Error adding route point",
      error: error.message,
    });
  }
};

/**
 * Update a single point in a procession route (admin only)
 */
exports.updateRoutePoint = async (req, res) => {
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
        message: "Only admins can update route points",
      });
    }

    const { id } = req.params;
    const { latitude, longitude, sequence } = req.body;

    // Check if at least one field to update is provided
    if (
      latitude === undefined &&
      longitude === undefined &&
      sequence === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one of latitude, longitude, or sequence must be provided",
      });
    }

    // Check if route point exists
    const [routePoint] = await query(
      `SELECT pr.route_id, pr.day_id, pr.latitude, pr.longitude, pr.sequence, pd.date
       FROM procession_routes pr
       JOIN procession_days pd ON pr.day_id = pd.day_id
       WHERE pr.route_id = ?`,
      [id]
    );

    if (!routePoint) {
      return res.status(404).json({
        success: false,
        message: "Route point not found",
      });
    }

    // Build update query
    const updates = {};
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (sequence !== undefined) updates.sequence = sequence;

    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(", ");

    const values = Object.values(updates);
    values.push(id);

    // Update the route point
    await query(
      `UPDATE procession_routes SET ${setClause} WHERE route_id = ?`,
      values
    );

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_route_point_updated",
      `Updated route point for day ${routePoint.date}`,
      id,
      "procession_routes"
    );

    // Get the updated route point
    const [updatedPoint] = await query(
      "SELECT route_id, day_id, latitude, longitude, sequence FROM procession_routes WHERE route_id = ?",
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Route point updated successfully",
      point: updatedPoint,
    });
  } catch (error) {
    console.error("Error updating route point:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating route point",
      error: error.message,
    });
  }
};

/**
 * Delete a single point from a procession route (admin only)
 */
exports.deleteRoutePoint = async (req, res) => {
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
        message: "Only admins can delete route points",
      });
    }

    const { id } = req.params;

    // Check if route point exists
    const [routePoint] = await query(
      `SELECT pr.route_id, pr.day_id, pr.latitude, pr.longitude, pr.sequence, pd.date
       FROM procession_routes pr
       JOIN procession_days pd ON pr.day_id = pd.day_id
       WHERE pr.route_id = ?`,
      [id]
    );

    if (!routePoint) {
      return res.status(404).json({
        success: false,
        message: "Route point not found",
      });
    }

    // Delete the route point
    await query("DELETE FROM procession_routes WHERE route_id = ?", [id]);

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_route_point_deleted",
      `Deleted route point (${routePoint.latitude}, ${routePoint.longitude}) at sequence ${routePoint.sequence} for day ${routePoint.date}`,
      id,
      "procession_routes"
    );

    return res.status(200).json({
      success: true,
      message: "Route point deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting route point:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting route point",
      error: error.message,
    });
  }
};

/**
 * Clear all route points for a specific day (admin only)
 */
exports.clearRoute = async (req, res) => {
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
        message: "Only admins can clear routes",
      });
    }

    const { dayId } = req.params;

    // Check if procession day exists
    const [day] = await query(
      "SELECT date FROM procession_days WHERE day_id = ?",
      [dayId]
    );

    if (!day) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }

    // Count how many points we're deleting for logging
    const [countResult] = await query(
      "SELECT COUNT(*) as count FROM procession_routes WHERE day_id = ?",
      [dayId]
    );

    // Delete all route points for this day
    await query("DELETE FROM procession_routes WHERE day_id = ?", [dayId]);

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "procession_route_cleared",
      `Cleared procession route for day ${day.date} (${countResult.count} points removed)`,
      dayId,
      "procession_routes"
    );

    return res.status(200).json({
      success: true,
      message: `Route cleared successfully. ${countResult.count} points removed.`,
    });
  } catch (error) {
    console.error("Error clearing route:", error);
    return res.status(500).json({
      success: false,
      message: "Error clearing route",
      error: error.message,
    });
  }
};
