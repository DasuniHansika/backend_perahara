// controllers/missingFunctions.js
const { query } = require("../../config/database-schema");


exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if requesting user is admin/super_admin or the user themselves
    let isAuthorized = ["admin", "super_admin"].includes(req.user.role);

    if (!isAuthorized) {
      // Check if the requested user ID matches the requesting user
      if (req.user.id === parseInt(id)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message:
          "Unauthorized: You don't have permission to view this user profile",
      });
    }

    // Fetch user information
    const userData = await query(
      `
      SELECT u.user_id, u.username, u.email, u.role, u.mobile_number,
             u.created_at, creator.username as created_by,
             COALESCE(c.first_name, s.first_name) as first_name,
             COALESCE(c.last_name, s.last_name) as last_name,
             CASE 
               WHEN u.role = 'customer' THEN c.profile_picture
               WHEN u.role = 'seller' THEN s.profile_picture 
               ELSE NULL 
             END as profile_picture
      FROM users u
      LEFT JOIN customers c ON u.user_id = c.user_id AND u.role = 'customer'
      LEFT JOIN sellers s ON u.user_id = s.user_id AND u.role = 'seller'
      LEFT JOIN users creator ON u.created_by = creator.user_id
      WHERE u.user_id = ?`,
      [id]
    );

    if (userData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: userData[0],
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: error.message,
    });
  }
};

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

      const userId = userResult.insertId;

      // Add role specific information
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
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'user_created', ?, ?, 'user')",
        [
          req.user.id,
          req.user.role,
          `Created ${role} account for ${username}`,
          userId,
        ]
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


exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if requesting user is admin/super_admin or the user themselves
    let isAuthorized = ["admin", "super_admin"].includes(req.user.role);

    if (!isAuthorized) {
      // Check if the requested user ID matches the requesting user
      if (req.user.id === parseInt(id)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You don't have permission to update this user",
      });
    }

    const { username, email, mobileNumber, firstName, lastName } = req.body;

    // Check if user exists
    const userCheck = await query(
      "SELECT user_id, role FROM users WHERE user_id = ?",
      [id]
    );

    if (userCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userRole = userCheck[0].role;
    const userId = userCheck[0].user_id;

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Update users table fields
      if (
        username !== undefined ||
        email !== undefined ||
        mobileNumber !== undefined
      ) {
        const updates = {};

        if (username !== undefined) {
          // Check if username is already taken by another user
          const existingUser = await query(
            "SELECT user_id FROM users WHERE username = ? AND user_id != ?",
            [username, id]
          );

          if (existingUser.length > 0) {
            await query("ROLLBACK");
            return res.status(409).json({
              success: false,
              message: "Username already taken",
            });
          }

          updates.username = username;
        }

        if (email !== undefined) {
          updates.email = email;
        }

        if (mobileNumber !== undefined) {
          updates.mobile_number = mobileNumber;
        }

        if (Object.keys(updates).length > 0) {
          const setClause = Object.keys(updates)
            .map((key) => `${key} = ?`)
            .join(", ");

          const values = Object.values(updates);
          values.push(id);

          await query(
            `UPDATE users SET ${setClause} WHERE user_id = ?`,
            values
          );
        }
      }

      // Update role-specific information
      if (firstName !== undefined || lastName !== undefined) {
        const updates = {};

        if (firstName !== undefined) {
          updates.first_name = firstName;
        }

        if (lastName !== undefined) {
          updates.last_name = lastName;
        }

        if (Object.keys(updates).length > 0) {
          const setClause = Object.keys(updates)
            .map((key) => `${key} = ?`)
            .join(", ");

          const values = Object.values(updates);
          values.push(id);

          if (userRole === "customer") {
            await query(
              `UPDATE customers SET ${setClause} WHERE user_id = ?`,
              values
            );
          } else if (userRole === "seller") {
            await query(
              `UPDATE sellers SET ${setClause} WHERE user_id = ?`,
              values
            );
          }
        }
      }

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'user_updated', ?, ?, 'user')",
        [req.user.id, req.user.role, `Updated user with ID: ${id}`, id]
      );

      // Commit transaction
      await query("COMMIT");

      // Get updated user data
      const [updatedUser] = await query(
        `
        SELECT u.user_id, u.username, u.email, u.role, u.mobile_number, u.created_at,
               COALESCE(c.first_name, s.first_name) as first_name,
               COALESCE(c.last_name, s.last_name) as last_name
        FROM users u
        LEFT JOIN customers c ON u.user_id = c.user_id AND u.role = 'customer'
        LEFT JOIN sellers s ON u.user_id = s.user_id AND u.role = 'seller'
        WHERE u.user_id = ?
        `,
        [id]
      );

      return res.status(200).json({
        success: true,
        message: "User updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating user",
      error: error.message,
    });
  }
};


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
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'user_deleted', ?, ?, 'user')",
        [
          req.user.id,
          req.user.role,
          `Deleted user ${user.username} with ID: ${id}`,
          id,
        ]
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
