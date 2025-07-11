// controllers/activityLogController.js
const { query } = require("../config/database-schema");

/**
 * Get all activity logs (admin only)
 */
exports.getAllLogs = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      userId,
      role,
      actionType,
      entityType,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sort = "timestamp",
      order = "desc",
    } = req.query;

    // Build query conditionally based on filters
    let sql = `
      SELECT al.log_id, al.user_id, al.role, al.action_type, 
             al.description, al.affected_entity_id, al.entity_type, 
             al.timestamp, u.username
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.user_id
    `;

    const queryParams = [];
    const conditions = [];

    // Add filters
    if (userId) {
      conditions.push("al.user_id = ?");
      queryParams.push(userId);
    }

    if (role) {
      conditions.push("al.role = ?");
      queryParams.push(role);
    }

    if (actionType) {
      conditions.push("al.action_type = ?");
      queryParams.push(actionType);
    }

    if (entityType) {
      conditions.push("al.entity_type = ?");
      queryParams.push(entityType);
    }

    if (startDate) {
      conditions.push("al.timestamp >= ?");
      queryParams.push(startDate);
    }

    if (endDate) {
      conditions.push("al.timestamp <= ?");
      queryParams.push(endDate);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    // Validate sort field
    const allowedSortFields = [
      "log_id",
      "user_id",
      "role",
      "action_type",
      "timestamp",
    ];
    const sortField = allowedSortFields.includes(sort) ? sort : "timestamp";

    // Validate order
    const orderDirection = order.toLowerCase() === "asc" ? "ASC" : "DESC";

    // Add sorting
    sql += ` ORDER BY al.${sortField} ${orderDirection}`;

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += " LIMIT ? OFFSET ?";
    queryParams.push(parseInt(limit), offset);

    // Execute query
    const logs = await query(sql, queryParams);

    // Get total count for pagination
    let countSql = "SELECT COUNT(*) as total FROM activity_logs al";
    if (conditions.length > 0) {
      countSql += " WHERE " + conditions.join(" AND ");
    }

    const [countResult] = await query(countSql, queryParams.slice(0, -2));
    const totalItems = countResult.total;
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    return res.status(200).json({
      success: true,
      totalItems,
      totalPages,
      currentPage: parseInt(page),
      pageSize: parseInt(limit),
      logs,
    });
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching activity logs",
      error: error.message,
    });
  }
};

/**
 * Get logs for a specific user
 */
exports.getUserLogs = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id: userId } = req.params;
    const {
      actionType,
      entityType,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    // Build query conditionally based on filters
    let sql = `
      SELECT al.log_id, al.user_id, al.role, al.action_type, 
             al.description, al.affected_entity_id, al.entity_type, 
             al.timestamp, u.username
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.user_id
      WHERE al.user_id = ?
    `;

    const queryParams = [userId];

    // Add additional filters
    if (actionType) {
      sql += " AND al.action_type = ?";
      queryParams.push(actionType);
    }

    if (entityType) {
      sql += " AND al.entity_type = ?";
      queryParams.push(entityType);
    }

    if (startDate) {
      sql += " AND al.timestamp >= ?";
      queryParams.push(startDate);
    }

    if (endDate) {
      sql += " AND al.timestamp <= ?";
      queryParams.push(endDate);
    }

    // Add sorting and pagination
    sql += " ORDER BY al.timestamp DESC";
    sql += " LIMIT ? OFFSET ?";

    const offset = (parseInt(page) - 1) * parseInt(limit);
    queryParams.push(parseInt(limit), offset);

    // Execute query
    const logs = await query(sql, queryParams);

    // Get total count for pagination
    let countSql =
      "SELECT COUNT(*) as total FROM activity_logs WHERE user_id = ?";
    const countParams = [userId];

    if (actionType) {
      countSql += " AND action_type = ?";
      countParams.push(actionType);
    }

    if (entityType) {
      countSql += " AND entity_type = ?";
      countParams.push(entityType);
    }

    if (startDate) {
      countSql += " AND timestamp >= ?";
      countParams.push(startDate);
    }

    if (endDate) {
      countSql += " AND timestamp <= ?";
      countParams.push(endDate);
    }

    const [countResult] = await query(countSql, countParams);
    const totalItems = countResult.total;
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    return res.status(200).json({
      success: true,
      totalItems,
      totalPages,
      currentPage: parseInt(page),
      pageSize: parseInt(limit),
      logs,
    });
  } catch (error) {
    console.error("Error fetching user logs:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching user logs",
      error: error.message,
    });
  }
};

/**
 * Get logs for current user
 */
exports.getMyLogs = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Reuse user logs endpoint with current user ID
    req.params.id = req.user.id;
    return this.getUserLogs(req, res);
  } catch (error) {
    console.error("Error fetching user logs:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching user logs",
      error: error.message,
    });
  }
};

/**
 * Get logs for a specific entity (e.g., a booking, shop, etc.)
 */
exports.getEntityLogs = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }
    const { entityType, entityId } = req.params;

    // Query the activity logs
    const logs = await query(
      `SELECT al.log_id, al.user_id, al.role, al.action_type, 
              al.description, al.affected_entity_id, al.entity_type, 
              al.timestamp, u.username
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       WHERE al.entity_type = ? AND al.affected_entity_id = ?
       ORDER BY al.timestamp DESC`,
      [entityType, entityId]
    );

    return res.status(200).json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    console.error("Error fetching entity logs:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching entity logs",
      error: error.message,
    });
  }
};

/**
 * Get logs by action type
 */
exports.getActionLogs = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { actionType } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Query the activity logs
    const logs = await query(
      `SELECT al.log_id, al.user_id, al.role, al.action_type, 
              al.description, al.affected_entity_id, al.entity_type, 
              al.timestamp, u.username
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       WHERE al.action_type = ?
       ORDER BY al.timestamp DESC
       LIMIT ? OFFSET ?`,
      [actionType, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]
    );

    // Get total count for pagination
    const [countResult] = await query(
      "SELECT COUNT(*) as total FROM activity_logs WHERE action_type = ?",
      [actionType]
    );

    const totalItems = countResult.total;
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    return res.status(200).json({
      success: true,
      totalItems,
      totalPages,
      currentPage: parseInt(page),
      pageSize: parseInt(limit),
      logs,
    });
  } catch (error) {
    console.error("Error fetching action logs:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching action logs",
      error: error.message,
    });
  }
};

/**
 * Create a new activity log entry
 */
exports.createLog = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      userId,
      role,
      actionType,
      description,
      affectedEntityId,
      entityType,
    } = req.body;

    if (!userId || !role || !actionType || !description) {
      return res.status(400).json({
        success: false,
        message: "User ID, role, action type, and description are required",
      });
    }

    // Check if user exists
    const [user] = await query("SELECT role FROM users WHERE user_id = ?", [
      userId,
    ]);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Create the log entry
    const result = await query(
      `INSERT INTO activity_logs
       (user_id, role, action_type, description, affected_entity_id, entity_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        role,
        actionType,
        description,
        affectedEntityId || null,
        entityType || null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Log entry created successfully",
      logId: result.insertId,
    });
  } catch (error) {
    console.error("Error creating log entry:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating log entry",
      error: error.message,
    });
  }
};
