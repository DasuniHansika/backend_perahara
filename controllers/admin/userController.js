const { query } = require("../../config/database-schema");
const { admin } = require("../../config/firebase");
const fs = require("fs");
const path = require("path");


exports.getUserStats = async (req, res) => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Admin access required",
      });
    }

    // Get counts for each user type
    const [totalUsers] = await query("SELECT COUNT(*) as count FROM users");
    const [customers] = await query("SELECT COUNT(*) as count FROM users WHERE role = 'customer'");
    const [sellers] = await query("SELECT COUNT(*) as count FROM users WHERE role = 'seller'");
    const [admins] = await query("SELECT COUNT(*) as count FROM users WHERE role IN ('admin', 'super_admin')");
    
    // Get total shops count
    const [totalShops] = await query("SELECT COUNT(*) as count FROM shops");

    // Get total seats count (sum of all quantities in seat_type_availability)
    const [totalSeats] = await query("SELECT SUM(quantity) as count FROM seat_type_availability WHERE available = TRUE");
    
    // Get booked seats count (sum of all quantities in bookings with confirmed status)
    const [bookedSeats] = await query(`
      SELECT SUM(quantity) as count 
      FROM bookings 
      WHERE status = 'confirmed'
    `);

    // Get booking statistics
    const [totalBookings] = await query("SELECT COUNT(*) as count FROM bookings");
    const [confirmedBookings] = await query("SELECT COUNT(*) as count FROM bookings WHERE status = 'confirmed'");
    
    // Get payment statistics
    const [totalPayments] = await query("SELECT COUNT(*) as count FROM payments");
    const [totalRevenue] = await query("SELECT SUM(amount) as total FROM payments WHERE status = 'success'");

    const availableSeats = (totalSeats.count || 0) - (bookedSeats.count || 0);

    return res.status(200).json({
      success: true,
      totalUsers: totalUsers.count,
      customers: customers.count,
      sellers: sellers.count,
      admins: admins.count,
      totalShops: totalShops.count,
      totalSeats: totalSeats.count || 0,
      availableSeats: availableSeats > 0 ? availableSeats : 0,
      totalBookings: totalBookings.count || 0,
      confirmedBookings: confirmedBookings.count || 0,
      totalPayments: totalPayments.count || 0,
      totalRevenue: totalRevenue.total || 0
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching user statistics",
      error: error.message,
    });
  }
};


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


exports.deleteAccount = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if user has any active bookings
    const activeBookings = await query(
      "SELECT COUNT(*) as count FROM bookings b JOIN customers c ON b.customer_id = c.customer_id WHERE c.user_id = ? AND b.status IN ('pending', 'confirmed')",
      [req.user.id]
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

exports.createUser = async (req, res) => {
  try {
    const { email, password, username, role, mobileNumber, firstName, lastName } = req.body;

    // Validate required fields
    if (!email || !password || !username || !role) {
      return res.status(400).json({
        success: false,
        message: "Email, password, username, and role are required",
      });
    }

    // Validate role
    const validRoles = ['customer', 'seller', 'admin', 'super_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified",
      });
    }

    // First create user in Firebase
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        email,
        password,
        displayName: username,
      });
    } catch (firebaseError) {
      console.error("Firebase create user error:", firebaseError);
      return res.status(400).json({
        success: false,
        message: "Error creating user in authentication system",
        error: firebaseError.message,
      });
    }

    // Then create user in our database
    await query(
      "INSERT INTO users (firebase_uid, email, username, role, mobile_number, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      [firebaseUser.uid, email, username, role, mobileNumber || null, req.user.id]
    );

    // Get the newly created user ID
    const newUser = await query(
      "SELECT user_id FROM users WHERE firebase_uid = ?",
      [firebaseUser.uid]
    );

    if (newUser.length === 0) {
      // Rollback Firebase user if our DB insert failed
      await admin.auth().deleteUser(firebaseUser.uid);
      return res.status(500).json({
        success: false,
        message: "Error creating user record",
      });
    }

    const userId = newUser[0].user_id;

    // Create role-specific record if needed
    if (role === 'customer') {
      await query(
        "INSERT INTO customers (user_id, first_name, last_name) VALUES (?, ?, ?)",
        [userId, firstName || null, lastName || null]
      );
    } else if (role === 'seller') {
      await query(
        "INSERT INTO sellers (user_id, first_name, last_name) VALUES (?, ?, ?)",
        [userId, firstName || null, lastName || null]
      );
    }

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        user_id: userId,
        email,
        username,
        role,
        mobile_number: mobileNumber || null,
      },
    });
  } catch (error) {
    console.error("Error creating user:", error);
    
    // Clean up Firebase user if created but our DB operation failed
    if (firebaseUser && firebaseUser.uid) {
      try {
        await admin.auth().deleteUser(firebaseUser.uid);
      } catch (cleanupError) {
        console.error("Error cleaning up Firebase user:", cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Error creating user",
      error: error.message,
    });
  }
};
exports.updateUser = async (req, res) => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Admin access required",
      });
    }

    const userId = req.params.id;
    const { username, email, mobileNumber, role, firstName, lastName, password } = req.body;

    // Validate required fields
    if (!username || !email || !role) {
      return res.status(400).json({
        success: false,
        message: "Username, email, and role are required",
      });
    }

    // Check if username is already taken by another user
    const existingUser = await query(
      "SELECT user_id FROM users WHERE username = ? AND user_id != ?",
      [username, userId]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username already taken",
      });
    }

    // Update user in Firebase (email and password if provided)
    try {
      const user = await query("SELECT firebase_uid FROM users WHERE user_id = ?", [userId]);
      if (user.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const firebaseUid = user[0].firebase_uid;
      const updateData = { email, displayName: username };

      if (password) {
        updateData.password = password;
      }

      await admin.auth().updateUser(firebaseUid, updateData);
    } catch (firebaseError) {
      console.error("Firebase update error:", firebaseError);
      return res.status(400).json({
        success: false,
        message: "Error updating user in authentication system",
        error: firebaseError.message,
      });
    }

    // Update user in our database
    await query(
      "UPDATE users SET username = ?, email = ?, mobile_number = ?, role = ? WHERE user_id = ?",
      [username, email, mobileNumber || null, role, userId]
    );

    // Update role-specific information
    if (role === 'customer') {
      // Check if customer record exists
      const customer = await query("SELECT user_id FROM customers WHERE user_id = ?", [userId]);

      if (customer.length > 0) {
        await query(
          "UPDATE customers SET first_name = ?, last_name = ? WHERE user_id = ?",
          [firstName || null, lastName || null, userId]
        );
      } else {
        await query(
          "INSERT INTO customers (user_id, first_name, last_name) VALUES (?, ?, ?)",
          [userId, firstName || null, lastName || null]
        );
      }
    } else if (role === 'seller') {
      // Check if seller record exists
      const seller = await query("SELECT user_id FROM sellers WHERE user_id = ?", [userId]);

      if (seller.length > 0) {
        await query(
          "UPDATE sellers SET first_name = ?, last_name = ? WHERE user_id = ?",
          [firstName || null, lastName || null, userId]
        );
      }
    }

    // Get updated user data
    const updatedUser = await query(
      `SELECT u.user_id, u.username, u.email, u.role, u.mobile_number,
              COALESCE(c.first_name, s.first_name) as first_name,
              COALESCE(c.last_name, s.last_name) as last_name
       FROM users u
       LEFT JOIN customers c ON u.user_id = c.user_id AND u.role = 'customer'
       LEFT JOIN sellers s ON u.user_id = s.user_id AND u.role = 'seller'
       WHERE u.user_id = ?`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser[0],
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating user",
      error: error.message,
    });
  }
};
exports.adminResetPassword = async (req, res) => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Admin access required",
      });
    }

    const userId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    // Get user's Firebase UID
    const user = await query("SELECT firebase_uid FROM users WHERE user_id = ?", [userId]);
    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const firebaseUid = user[0].firebase_uid;

    // Update password in Firebase
    try {
      await admin.auth().updateUser(firebaseUid, {
        password: newPassword
      });
    } catch (firebaseError) {
      console.error("Firebase password reset error:", firebaseError);
      return res.status(400).json({
        success: false,
        message: "Error resetting password in authentication system",
        error: firebaseError.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Error in admin password reset:", error);
    return res.status(500).json({
      success: false,
      message: "Error resetting password",
      error: error.message,
    });
  }
};
exports.verifyAdmin = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    // Check MySQL database for user record using the authenticated user's ID
    const [user] = await query(
      "SELECT role FROM users WHERE user_id = ?", 
      [req.user.id] // Use the user ID from the middleware
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in database"
      });
    }

    // Check if user has admin, super_admin, or seller role
    const isAdmin = ['admin', 'super_admin', 'seller'].includes(user.role);
    
    return res.status(200).json({
      success: true,
      isAdmin: isAdmin,
      role: user.role
    });
  } catch (error) {
    console.error("Error verifying admin status:", error);
    return res.status(500).json({
      success: false,
      message: "Error verifying admin status"
    });
  }
};



