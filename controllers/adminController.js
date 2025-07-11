// controllers/adminController.js
const { query } = require("../config/database-schema");
const fs = require("fs");
const path = require("path");
const { admin } = require("../config/firebase");

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
 * Get admin profile by ID
 */
exports.getAdminById = async (req, res) => {
  try {
    const { id } = req.params;

    // If not super admin, can only view own profile
    if (req.user.role !== "super_admin" && req.user.user_id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You can only view your own profile",
      });
    }

    const [admin] = await query(
      `SELECT a.admin_id, u.user_id, u.username, u.email, 
              u.role, u.mobile_number, u.created_at,
              creator.username as created_by
       FROM admins a
       JOIN users u ON a.user_id = u.user_id
       LEFT JOIN users creator ON u.created_by = creator.user_id
       WHERE a.admin_id = ?`,
      [id]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Get additional stats
    const [stats] = await query(
      `SELECT 
        (SELECT COUNT(*) FROM users WHERE created_by = ?) as users_created,
        (SELECT COUNT(*) FROM activity_logs WHERE user_id = ?) as activity_count
      `,
      [admin.user_id, admin.user_id]
    );

    return res.status(200).json({
      success: true,
      admin: {
        ...admin,
        ...stats,
      },
    });
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching admin profile",
      error: error.message,
    });
  }
};

/**
 * Get all admins (super_admin only)
 */
exports.getAllAdmins = async (req, res) => {
  try {
    // Check view permission for admin table    const { search } = req.query;
    let sql = `
      SELECT a.admin_id, u.user_id, u.username, u.email, 
             u.role, u.mobile_number, u.created_at,
             creator.username as created_by
      FROM admins a
      JOIN users u ON a.user_id = u.user_id
      LEFT JOIN users creator ON u.created_by = creator.user_id
    `;

    const params = [];

    if (search) {
      sql += `
        WHERE u.username LIKE ? 
        OR u.email LIKE ?
      `;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    sql += " ORDER BY u.created_at DESC";

    const admins = await query(sql, params);

    return res.status(200).json({
      success: true,
      count: admins.length,
      admins,
    });
  } catch (error) {
    console.error("Error fetching admins:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching admins",
      error: error.message,
    });
  }
};

/**
 * Create a new admin (super_admin only)
 */
exports.createAdmin = async (req, res) => {
  try {
    const { firebaseUid, username, email, mobileNumber } = req.body;

    if (!firebaseUid || !username || !email) {
      return res.status(400).json({
        success: false,
        message: "Firebase UID, username, and email are required",
      });
    }

    // Check if Firebase UID exists in Firebase
    try {
      await admin.auth().getUser(firebaseUid);
    } catch (firebaseError) {
      console.error("Firebase getUser error:", firebaseError);
      return res.status(400).json({
        success: false,
        message: "Invalid Firebase UID",
      });
    }

    // Check if username or Firebase UID already exists
    const existingUser = await query(
      "SELECT user_id FROM users WHERE username = ? OR firebase_uid = ?",
      [username, firebaseUid]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username or Firebase UID already exists",
      });
    }

    // Execute stored procedure to create admin
    await query("CALL sp_register_admin(?, ?, ?, ?, ?)", [
      req.user.id,
      firebaseUid,
      username,
      email,
      mobileNumber || null,
    ]);

    // Get the newly created admin
    const [newAdmin] = await query(
      `SELECT a.admin_id, u.user_id, u.username, u.email, 
              u.role, u.mobile_number, u.created_at
       FROM admins a
       JOIN users u ON a.user_id = u.user_id
       WHERE u.firebase_uid = ?`,
      [firebaseUid]
    );

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "admin_created",
      `Created admin user ${username} with email ${email}`,
      newAdmin.user_id,
      "users"
    );

    return res.status(201).json({
      success: true,
      message: "Admin created successfully",
      admin: newAdmin,
    });
  } catch (error) {
    console.error("Error creating admin:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating admin",
      error: error.message,
    });
  }
};

/**
 * Update admin details (own profile or super_admin only)
 */
exports.updateAdmin = async (req, res) => {
  try {
    if (
      !req.user ||
      (req.user.role !== "admin" && req.user.role !== "super_admin")
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Admin access required",
      });
    }

    const { id } = req.params;
    const { username, mobileNumber } = req.body;

    // Find the admin
    const [admin] = await query(
      "SELECT a.admin_id, a.user_id FROM admins a WHERE a.admin_id = ?",
      [id]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Build update query
    const updates = {};
    if (username !== undefined) {
      // Check if username is available
      const [existingUser] = await query(
        "SELECT user_id FROM users WHERE username = ? AND user_id != ?",
        [username, admin.user_id]
      );

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Username already taken",
        });
      }

      updates.username = username;
    }

    if (mobileNumber !== undefined) {
      updates.mobile_number = mobileNumber;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    // Build update SQL
    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(", ");

    const values = Object.values(updates);
    values.push(admin.user_id);

    await query(`UPDATE users SET ${setClause} WHERE user_id = ?`, values);

    // Get the updated admin
    const [updatedAdmin] = await query(
      `SELECT a.admin_id, u.user_id, u.username, u.email, 
              u.role, u.mobile_number, u.created_at
       FROM admins a
       JOIN users u ON a.user_id = u.user_id
       WHERE a.admin_id = ?`,
      [id]
    );

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "admin_updated",
      `Updated admin profile for ${updatedAdmin.username}`,
      updatedAdmin.user_id,
      "users"
    );

    return res.status(200).json({
      success: true,
      message: "Admin updated successfully",
      admin: updatedAdmin,
    });
  } catch (error) {
    console.error("Error updating admin:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating admin",
      error: error.message,
    });
  }
};

/**
 * Delete an admin (super_admin only)
 */
exports.deleteAdmin = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Super Admin access required",
      });
    }

    const { id } = req.params;

    // Check if admin exists
    const [admin] = await query(
      `SELECT a.admin_id, a.user_id, u.username, u.firebase_uid
       FROM admins a
       JOIN users u ON a.user_id = u.user_id
       WHERE a.admin_id = ?`,
      [id]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Don't allow deleting yourself
    if (req.user.id === admin.user_id) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    // Check if there are any users created by this admin
    const [createdUsers] = await query(
      "SELECT COUNT(*) as count FROM users WHERE created_by = ?",
      [admin.user_id]
    );

    // Instead of stopping the deletion, just log the count for information
    const adminUsername = admin.username;
    const createdUsersCount = createdUsers.count;

    // Delete the user (cascades to admins table due to FK constraints)
    await query("DELETE FROM users WHERE user_id = ?", [admin.user_id]);

    // Log the activity
    await logActivity(
      req.user.id,
      req.user.role,
      "admin_deleted",
      `Deleted admin ${adminUsername} who had created ${createdUsersCount} users`,
      admin.user_id,
      "users"
    );

    return res.status(200).json({
      success: true,
      message: `Admin deleted successfully. Note: ${createdUsersCount} users were created by this admin.`,
    });
  } catch (error) {
    console.error("Error deleting admin:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting admin",
      error: error.message,
    });
  }
};

/**
 * Create a new user (admin only)
 */
exports.createUser = async (req, res) => {
  try {
    if (
      !req.user ||
      (req.user.role !== "admin" && req.user.role !== "super_admin")
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Admin access required",
      });
    }

    const { username, email, role, mobileNumber, firstName, lastName } =
      req.body;

    // Validate required fields
    if (!username || !email || !role) {
      return res.status(400).json({
        success: false,
        message: "Username, email, and role are required",
      });
    }

    // Validate role
    const validRoles = ["customer", "seller", "admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be one of: customer, seller, admin",
      });
    }

    // Check if username already exists
    const existingUser = await query(
      "SELECT user_id FROM users WHERE username = ?",
      [username]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username already taken",
      });
    }

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Insert into users table
      const userResult = await query(
        "INSERT INTO users (username, email, role, mobile_number, created_by) VALUES (?, ?, ?, ?, ?)",
        [username, email, role, mobileNumber || null, req.user.id]
      );

      const userId = userResult.insertId; // Add role specific information
      if (role === "customer") {
        await query(
          "INSERT INTO customers (user_id, first_name, last_name) VALUES (?, ?, ?)",
          [userId, firstName || null, lastName || null]
        );
      } else if (role === "seller") {
        await query(
          "INSERT INTO sellers (user_id, first_name, last_name) VALUES (?, ?, ?)",
          [userId, firstName || null, lastName || null]
        );
      } else if (role === "admin") {
        await query("INSERT INTO admins (user_id) VALUES (?)", [userId]);
      }

      // Log activity
      await logActivity(
        req.user.id,
        req.user.role,
        "user_created",
        `Created ${role} account for ${username}`,
        userId,
        "user"
      );

      // Commit transaction
      await query("COMMIT");

      // Get the new user data
      const [newUser] = await query(
        `
        SELECT u.user_id, u.username, u.email, u.role, u.mobile_number, u.created_at,
               COALESCE(c.first_name, s.first_name) as first_name,
               COALESCE(c.last_name, s.last_name) as last_name
        FROM users u
        LEFT JOIN customers c ON u.user_id = c.user_id AND u.role = 'customer'
        LEFT JOIN sellers s ON u.user_id = s.user_id AND u.role = 'seller'
        WHERE u.user_id = ?
        `,
        [userId]
      );

      return res.status(201).json({
        success: true,
        message: "User created successfully",
        user: newUser,
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating user",
      error: error.message,
    });
  }
};

/**
 * Delete a user
 */
exports.deleteUser = async (req, res) => {
  try {
    if (
      !req.user ||
      (req.user.role !== "admin" && req.user.role !== "super_admin")
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Admin access required",
      });
    }

    const { id } = req.params;

    // Don't allow deleting yourself
    if (req.user.id === parseInt(id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account through this endpoint",
      });
    }

    // Check if user exists
    const [user] = await query(
      "SELECT user_id, username, role FROM users WHERE user_id = ?",
      [id]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Additional check: don't allow normal admins to delete other admins
    if (user.role === "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only super admins can delete admin accounts",
      });
    }

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Log activity before deletion
      await logActivity(
        req.user.id,
        req.user.role,
        "user_deleted",
        `Deleted user ${user.username} with ID: ${id}`,
        id,
        "user"
      );

      // Delete user (will cascade to role-specific tables if FK constraints are set up)
      await query("DELETE FROM users WHERE user_id = ?", [id]);

      // Commit transaction
      await query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting user",
      error: error.message,
    });
  }
};
