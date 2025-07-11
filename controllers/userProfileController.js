// controllers/userProfileController.js
const { query } = require("../config/database-schema");
const { admin } = require("../config/firebase");

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
             s.profile_picture as seller_profile_picture,
             CASE 
               WHEN u.role = 'seller' THEN s.profile_picture 
               ELSE NULL 
             END as profile_picture
      FROM users u
      LEFT JOIN customers c ON u.user_id = c.user_id
      LEFT JOIN sellers s ON u.user_id = s.user_id
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

    const { username, mobileNumber, firstName, lastName, profilePicture } =
      req.body;
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
      (firstName !== undefined ||
        lastName !== undefined ||
        profilePicture !== undefined)
    ) {
      const sellerUpdates = {};

      if (firstName !== undefined) {
        sellerUpdates.first_name = firstName;
      }

      if (lastName !== undefined) {
        sellerUpdates.last_name = lastName;
      }

      if (profilePicture !== undefined) {
        sellerUpdates.profile_picture = profilePicture;
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
             CASE WHEN u.role = 'seller' THEN s.profile_picture ELSE NULL END as profile_picture
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
exports.updateMyProfileWithImage = async (req, res) => {
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

    // Only sellers can upload profile pictures
    if (req.user.role !== "seller") {
      return res.status(403).json({
        success: false,
        message: "Only sellers can upload profile pictures",
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

    // Update seller information and profile picture
    if (req.user.role === "seller") {
      const sellerUpdates = {};

      if (firstName !== undefined) {
        sellerUpdates.first_name = firstName;
      }

      if (lastName !== undefined) {
        sellerUpdates.last_name = lastName;
      }

      // Store the image path
      sellerUpdates.profile_picture = `/uploads/profiles/${profileImage.filename}`;

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

    // Get updated profile
    const updatedProfile = await query(
      `
      SELECT u.user_id, u.username, u.email, u.role, u.mobile_number,
             COALESCE(c.first_name, s.first_name) as first_name,
             COALESCE(c.last_name, s.last_name) as last_name,
             CASE WHEN u.role = 'seller' THEN s.profile_picture ELSE NULL END as profile_picture
      FROM users u
      LEFT JOIN customers c ON u.user_id = c.user_id AND u.role = 'customer'
      LEFT JOIN sellers s ON u.user_id = s.user_id AND u.role = 'seller'
      WHERE u.user_id = ?`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully with image",
      profile: updatedProfile[0],
    });
  } catch (error) {
    console.error("Error updating user profile with image:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating user profile with image",
      error: error.message,
    });
  }
};

/**
 * Change user's email - This will update both our database and Firebase Auth
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

    // Update email in Firebase Auth
    await admin.auth().updateUser(req.firebaseUid, { email });

    // Update email in our database
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

    // Handle Firebase specific errors
    if (error.code === "auth/email-already-exists") {
      return res.status(409).json({
        success: false,
        message: "Email is already in use by another account",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error updating email",
      error: error.message,
    });
  }
};

/**
 * Delete user account - This will delete both Firebase Auth account and our database records
 */
exports.deleteAccount = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Begin transaction
    await query("START TRANSACTION");

    // Delete user data from our database (use cascade if set up properly)
    // You may need to delete from related tables first depending on your DB structure
    await query("DELETE FROM users WHERE user_id = ?", [req.user.id]);

    // Delete Firebase Auth account
    await admin.auth().deleteUser(req.firebaseUid);

    // Commit transaction
    await query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    // Rollback transaction on error
    await query("ROLLBACK");

    console.error("Error deleting account:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting account",
      error: error.message,
    });
  }
};
