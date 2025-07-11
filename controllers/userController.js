// controllers/userController.js
const { query } = require("../config/database-schema");
const { admin } = require("../config/firebase");
const fs = require("fs");
const path = require("path");

/**
 * Get current user's profile based on Firebase UID
 */
exports.getMyProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check for includeSellerProfile parameter
    const includeSellerProfile = req.query.includeSellerProfile === "true";

    // Fetch user profile information with conditional profile picture access
    const userProfile = await query(
      `
      SELECT u.user_id, u.username, u.email, u.role, u.mobile_number,
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
      WHERE u.user_id = ?`,
      [req.user.id]
    );

    if (userProfile.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      profile: userProfile[0],
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching user profile",
      error: error.message,
    });
  }
};

/**
 * Update current user's profile
 */
exports.updateMyProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { username, mobileNumber, firstName, lastName } = req.body;
    const updates = {};

    // Build dynamic update query for users table
    if (username !== undefined) {
      // Check if username is already taken by another user
      const existingUser = await query(
        "SELECT user_id FROM users WHERE username = ? AND user_id != ?",
        [username, req.user.id]
      );

      if (existingUser.length > 0) {
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

    // Update user table if we have updates
    if (Object.keys(updates).length > 0) {
      const setClause = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(", ");

      const values = Object.values(updates);
      values.push(req.user.id);

      await query(`UPDATE users SET ${setClause} WHERE user_id = ?`, values);
    }

    // Update customer information if user is a customer
    if (
      req.user.role === "customer" &&
      (firstName !== undefined || lastName !== undefined)
    ) {
      const customerUpdates = {};

      if (firstName !== undefined) {
        customerUpdates.first_name = firstName;
      }

      if (lastName !== undefined) {
        customerUpdates.last_name = lastName;
      }

      if (Object.keys(customerUpdates).length > 0) {
        const setClause = Object.keys(customerUpdates)
          .map((key) => `${key} = ?`)
          .join(", ");

        const values = Object.values(customerUpdates);
        values.push(req.user.id);

        // Check if customer record exists
        const customer = await query(
          "SELECT user_id FROM customers WHERE user_id = ?",
          [req.user.id]
        );

        if (customer.length > 0) {
          await query(
            `UPDATE customers SET ${setClause} WHERE user_id = ?`,
            values
          );
        } else {
          // Create customer record if it doesn't exist
          await query(
            "INSERT INTO customers (user_id, first_name, last_name) VALUES (?, ?, ?)",
            [
              req.user.id,
              customerUpdates.first_name || null,
              customerUpdates.last_name || null,
            ]
          );
        }
      }
    }

    // Update seller information if user is a seller
    if (
      req.user.role === "seller" &&
      (firstName !== undefined || lastName !== undefined)
    ) {
      const sellerUpdates = {};

      if (firstName !== undefined) {
        sellerUpdates.first_name = firstName;
      }

      if (lastName !== undefined) {
        sellerUpdates.last_name = lastName;
      }

      if (Object.keys(sellerUpdates).length > 0) {
        const setClause = Object.keys(sellerUpdates)
          .map((key) => `${key} = ?`)
          .join(", ");

        const values = Object.values(sellerUpdates);
        values.push(req.user.id);

        // Check if seller record exists
        const seller = await query(
          "SELECT user_id FROM sellers WHERE user_id = ?",
          [req.user.id]
        );

        if (seller.length > 0) {
          await query(
            `UPDATE sellers SET ${setClause} WHERE user_id = ?`,
            values
          );
        }
      }
    }

    // Get updated profile
    const updatedProfile = await query(
      `
      SELECT u.user_id, u.username, u.email, u.role, u.mobile_number,
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
      WHERE u.user_id = ?`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      profile: updatedProfile[0],
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating user profile",
      error: error.message,
    });
  }
};

/**
 * Update current user's profile with image upload
 */
exports.updateProfileWithImage = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { username, mobileNumber, firstName, lastName } = req.body;
    const profileImage = req.file;

    if (!profileImage) {
      return res.status(400).json({
        success: false,
        message: "Profile image is required",
      });
    }

    const updates = {};

    // Build dynamic update query for users table
    if (username !== undefined) {
      // Check if username is already taken by another user
      const existingUser = await query(
        "SELECT user_id FROM users WHERE username = ? AND user_id != ?",
        [username, req.user.id]
      );

      if (existingUser.length > 0) {
        // Delete uploaded file if username is taken
        fs.unlinkSync(profileImage.path);
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

    // Update user table if we have updates
    if (Object.keys(updates).length > 0) {
      const setClause = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(", ");

      const values = Object.values(updates);
      values.push(req.user.id);

      await query(`UPDATE users SET ${setClause} WHERE user_id = ?`, values);
    }

    const profileImagePath = `/uploads/profiles/${profileImage.filename}`;

    // Update profile picture based on user role
    if (req.user.role === "customer") {
      // For customers, update or create customer record with profile pic
      const customer = await query(
        "SELECT user_id FROM customers WHERE user_id = ?",
        [req.user.id]
      );

      if (customer.length > 0) {
        // Update existing customer
        await query(
          "UPDATE customers SET profile_picture = ? WHERE user_id = ?",
          [profileImagePath, req.user.id]
        );
      } else {
        // Create new customer record
        await query(
          "INSERT INTO customers (user_id, first_name, last_name, profile_picture) VALUES (?, ?, ?, ?)",
          [req.user.id, firstName || null, lastName || null, profileImagePath]
        );
      }
    } else if (req.user.role === "seller") {
      // For sellers, update profile picture
      await query("UPDATE sellers SET profile_picture = ? WHERE user_id = ?", [
        profileImagePath,
        req.user.id,
      ]);

      // Update other fields if provided
      if (firstName !== undefined || lastName !== undefined) {
        const sellerUpdates = {};

        if (firstName !== undefined) sellerUpdates.first_name = firstName;
        if (lastName !== undefined) sellerUpdates.last_name = lastName;

        if (Object.keys(sellerUpdates).length > 0) {
          const setClause = Object.keys(sellerUpdates)
            .map((key) => `${key} = ?`)
            .join(", ");

          const values = Object.values(sellerUpdates);
          values.push(req.user.id);

          await query(
            `UPDATE sellers SET ${setClause} WHERE user_id = ?`,
            values
          );
        }
      }
    } else {
      // For admins, we don't store profile pictures
      fs.unlinkSync(profileImage.path);
      return res.status(403).json({
        success: false,
        message:
          "Profile picture uploads are only allowed for customers and sellers",
      });
    }

    // Get updated profile
    const updatedProfile = await query(
      `
      SELECT u.user_id, u.username, u.email, u.role, u.mobile_number,
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
      WHERE u.user_id = ?`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully with new image",
      profile: updatedProfile[0],
    });
  } catch (error) {
    console.error("Error updating profile with image:", error);
    // Delete uploaded file if there was an error
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({
      success: false,
      message: "Error updating profile with image",
      error: error.message,
    });
  }
};

/**
 * Update user's email
 */
exports.updateEmail = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // First update in Firebase Auth
    try {
      await admin.auth().updateUser(req.user.firebaseUid, { email });
    } catch (firebaseError) {
      console.error("Firebase update email error:", firebaseError);
      return res.status(400).json({
        success: false,
        message: "Error updating email with authentication provider",
        error: firebaseError.message,
      });
    }

    // Then update in our database
    await query("UPDATE users SET email = ? WHERE user_id = ?", [
      email,
      req.user.id,
    ]);

    return res.status(200).json({
      success: true,
      message: "Email updated successfully",
    });
  } catch (error) {
    console.error("Error updating email:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating email",
      error: error.message,
    });
  }
};

/**
 * Delete current user's account
 */
exports.deleteAccount = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if user has any active bookings
    console.log(
      "🔍 [UserController] Checking active bookings for user:",
      req.user.id
    );
    const activeBookings = await query(
      "SELECT COUNT(*) as count FROM bookings WHERE customer_id = ? AND status IN ('pending', 'confirmed')",
      [req.user.id]
    );
    console.log(
      "📊 [UserController] Active bookings count:",
      activeBookings[0].count
    );

    if (activeBookings[0].count > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete account with active bookings. Please cancel all bookings first.",
      });
    }

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Log activity before deleting
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description) VALUES (?, ?, 'account_deletion', 'User deleted their account')",
        [req.user.id, req.user.role]
      );

      // Delete user from our database - cascades to customer/seller tables due to foreign key constraints
      await query("DELETE FROM users WHERE user_id = ?", [req.user.id]);

      // Delete user from Firebase Auth
      try {
        await admin.auth().deleteUser(req.user.firebaseUid);
      } catch (firebaseError) {
        // If Firebase deletion fails, rollback our database changes
        await query("ROLLBACK");
        console.error("Firebase delete user error:", firebaseError);
        return res.status(500).json({
          success: false,
          message:
            "Error deleting account from authentication provider, changes rolled back",
          error: firebaseError.message,
        });
      }

      // Commit transaction
      await query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Account deleted successfully",
      });
    } catch (dbError) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw dbError;
    }
  } catch (error) {
    console.error("Error deleting account:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting account",
      error: error.message,
    });
  }
};

/**
 * Get all users (admin only)
 */
exports.getAllUsers = async (req, res) => {
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

    // Add optional filters
    const { role, search } = req.query;
    let sql = `
      SELECT u.user_id, u.username, u.email, u.role, u.mobile_number,
             u.created_at, creator.username as created_by,
             COALESCE(c.first_name, s.first_name) as first_name,
             COALESCE(c.last_name, s.last_name) as last_name
      FROM users u
      LEFT JOIN customers c ON u.user_id = c.user_id AND u.role = 'customer'
      LEFT JOIN sellers s ON u.user_id = s.user_id AND u.role = 'seller'
      LEFT JOIN users creator ON u.created_by = creator.user_id
    `;

    const queryParams = [];
    const conditions = [];

    if (role) {
      conditions.push("u.role = ?");
      queryParams.push(role);
    }

    if (search) {
      conditions.push(
        "(u.username LIKE ? OR u.email LIKE ? OR COALESCE(c.first_name, s.first_name) LIKE ? OR COALESCE(c.last_name, s.last_name) LIKE ?)"
      );
      const searchPattern = `%${search}%`;
      queryParams.push(
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern
      );
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY u.created_at DESC";

    const users = await query(sql, queryParams);

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message,
    });
  }
};

/**
 * Get user by ID - admin or user themselves
 */
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

/**
 * Update a user
 */
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
