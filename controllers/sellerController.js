// controllers/sellerController.js
const { query } = require("../config/database-schema");
const fs = require("fs");
const path = require("path");

/**
 * Get seller profile by seller ID
 */
exports.getSellerById = async (req, res) => {
  try {
    const { id } = req.params;

    // Query seller data
    const sellerData = await query(
      `
      SELECT s.seller_id, u.username, u.email, u.mobile_number,
             s.first_name, s.last_name, s.profile_picture,
             s.nic, s.bank_account_number, s.bank_name, s.branch_name,
             u.created_at
      FROM sellers s
      JOIN users u ON s.user_id = u.user_id
      WHERE s.seller_id = ?
      `,
      [id]
    );

    if (sellerData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Get seller's shops
    const shops = await query(
      `
      SELECT shop_id, name, street, latitude, longitude, 
             image1, image2, image3, image4, description
      FROM shops
      WHERE seller_id = ?
      `,
      [id]
    ); // Process sensitive information
    const seller = sellerData[0];

    return res.status(200).json({
      success: true,
      seller,
      shops,
    });
  } catch (error) {
    console.error("Error fetching seller profile:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seller profile",
      error: error.message,
    });
  }
};

/**
 * Get all sellers
 */
exports.getAllSellers = async (req, res) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT s.seller_id, u.username, u.email, u.mobile_number,
             s.first_name, s.last_name, s.profile_picture,
             u.created_at,
             (SELECT COUNT(*) FROM shops WHERE seller_id = s.seller_id) as shop_count
      FROM sellers s
      JOIN users u ON s.user_id = u.user_id
    `;

    const params = [];

    if (search) {
      sql += `
        WHERE u.username LIKE ? 
        OR u.email LIKE ? 
        OR s.first_name LIKE ? 
        OR s.last_name LIKE ?
        OR u.mobile_number LIKE ?
      `;
      const searchPattern = `%${search}%`;
      params.push(
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern
      );
    }

    sql += " ORDER BY u.created_at DESC";

    const sellers = await query(sql, params);

    return res.status(200).json({
      success: true,
      count: sellers.length,
      sellers,
    });
  } catch (error) {
    console.error("Error fetching sellers:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching sellers",
      error: error.message,
    });
  }
};

/**
 * Create a new seller (admin only)
 */
exports.createSeller = async (req, res) => {
  try {
    const {
      username,
      email,
      mobileNumber,
      firstName,
      lastName,
      nic,
      bankAccountNumber,
      bankName,
      branchName,
    } = req.body;

    // Validate required fields
    if (
      !username ||
      !email ||
      !firstName ||
      !lastName ||
      !nic ||
      !bankAccountNumber ||
      !bankName ||
      !branchName
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
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
        "INSERT INTO users (username, email, role, mobile_number, created_by) VALUES (?, ?, 'seller', ?, ?)",
        [username, email, mobileNumber || null, req.user.id]
      );

      const userId = userResult.insertId;

      // Insert into sellers table
      await query(
        "INSERT INTO sellers (user_id, first_name, last_name, nic, bank_account_number, bank_name, branch_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          userId,
          firstName,
          lastName,
          nic,
          bankAccountNumber,
          bankName,
          branchName,
        ]
      );

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seller_created', ?, ?, 'seller')",
        [
          req.user.id,
          req.user.role,
          `Created seller account for ${username}`,
          userId,
        ]
      );

      // Commit transaction
      await query("COMMIT");

      // Get the new seller data
      const [newSeller] = await query(
        `
        SELECT s.seller_id, u.user_id, u.username, u.email, u.role, u.mobile_number,
               s.first_name, s.last_name
        FROM users u
        JOIN sellers s ON u.user_id = s.user_id
        WHERE u.user_id = ?
        `,
        [userId]
      );

      return res.status(201).json({
        success: true,
        message: "Seller created successfully",
        seller: newSeller,
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error creating seller:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating seller",
      error: error.message,
    });
  }
};

/**
 * Update seller profile (admin or seller themselves)
 */
exports.updateSeller = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      username,
      email,
      mobileNumber,
      firstName,
      lastName,
      nic,
      bankAccountNumber,
      bankName,
      branchName,
    } = req.body;

    // Get seller data to check if it exists
    const sellerData = await query(
      "SELECT s.user_id FROM sellers s WHERE s.seller_id = ?",
      [id]
    );

    if (sellerData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    const userId = sellerData[0].user_id;

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Update users table
      if (username || email || mobileNumber !== undefined) {
        const userUpdates = {};

        if (username) {
          // Check if username already exists for another user
          const existingUser = await query(
            "SELECT user_id FROM users WHERE username = ? AND user_id != ?",
            [username, userId]
          );

          if (existingUser.length > 0) {
            await query("ROLLBACK");
            return res.status(409).json({
              success: false,
              message: "Username already taken",
            });
          }

          userUpdates.username = username;
        }

        if (email) userUpdates.email = email;
        if (mobileNumber !== undefined)
          userUpdates.mobile_number = mobileNumber;

        if (Object.keys(userUpdates).length > 0) {
          const setClause = Object.keys(userUpdates)
            .map((key) => `${key} = ?`)
            .join(", ");

          const values = Object.values(userUpdates);
          values.push(userId);

          await query(
            `UPDATE users SET ${setClause} WHERE user_id = ?`,
            values
          );
        }
      }

      // Update sellers table
      if (
        firstName ||
        lastName ||
        nic ||
        bankAccountNumber ||
        bankName ||
        branchName
      ) {
        const sellerUpdates = {};

        if (firstName) sellerUpdates.first_name = firstName;
        if (lastName) sellerUpdates.last_name = lastName;
        if (nic) sellerUpdates.nic = nic;
        if (bankAccountNumber)
          sellerUpdates.bank_account_number = bankAccountNumber;
        if (bankName) sellerUpdates.bank_name = bankName;
        if (branchName) sellerUpdates.branch_name = branchName;

        if (Object.keys(sellerUpdates).length > 0) {
          const setClause = Object.keys(sellerUpdates)
            .map((key) => `${key} = ?`)
            .join(", ");

          const values = Object.values(sellerUpdates);
          values.push(id);

          await query(
            `UPDATE sellers SET ${setClause} WHERE seller_id = ?`,
            values
          );
        }
      }

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seller_updated', ?, ?, 'seller')",
        [
          req.user.id,
          req.user.role,
          `Updated seller profile for seller ID ${id}`,
          id,
        ]
      );

      // Commit transaction
      await query("COMMIT");

      // Get updated seller data
      const [updatedSeller] = await query(
        `
        SELECT s.seller_id, u.username, u.email, u.mobile_number,
               s.first_name, s.last_name, s.profile_picture,
               s.nic, s.bank_account_number, s.bank_name, s.branch_name
        FROM sellers s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.seller_id = ?
        `,
        [id]
      );

      return res.status(200).json({
        success: true,
        message: "Seller updated successfully",
        seller: updatedSeller,
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error updating seller:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating seller",
      error: error.message,
    });
  }
};

/**
 * Helper function to mask sensitive information
 */
function maskSensitiveInfo(text) {
  if (!text) return null;
  if (text.length <= 4) {
    return "*".repeat(text.length);
  }
  return "*".repeat(text.length - 4) + text.slice(-4);
}

/**
 * Helper function to check if logged in user is the same seller
 */
function isSameSellerAsLoggedIn(req, sellerId) {
  if (!req.user || req.user.role !== "seller") return false;

  // This is a simplification - in reality, you'd need to fetch the seller_id for the current user
  return req.user.sellerId === sellerId;
}

/**
 * Delete seller (admin only)
 */
exports.deleteSeller = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if seller exists
    const sellerData = await query(
      "SELECT s.user_id FROM sellers s WHERE s.seller_id = ?",
      [id]
    );

    if (sellerData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Check if seller has any shops
    const shops = await query(
      "SELECT COUNT(*) as count FROM shops WHERE seller_id = ?",
      [id]
    );

    if (shops[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete seller with existing shops",
      });
    }

    const userId = sellerData[0].user_id;

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Delete from sellers table first
      await query("DELETE FROM sellers WHERE seller_id = ?", [id]);

      // Delete from users table
      await query("DELETE FROM users WHERE user_id = ?", [userId]);

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seller_deleted', ?, ?, 'seller')",
        [req.user.id, req.user.role, `Deleted seller with ID ${id}`, id]
      );

      // Commit transaction
      await query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Seller deleted successfully",
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error deleting seller:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting seller",
      error: error.message,
    });
  }
};

/**
 * Seller login (placeholder - typically handled by Firebase)
 */
exports.loginSeller = async (req, res) => {
  try {
    return res.status(501).json({
      success: false,
      message: "Login is handled through Firebase authentication",
    });
  } catch (error) {
    console.error("Error in loginSeller:", error);
    return res.status(500).json({
      success: false,
      message: "Error in login process",
      error: error.message,
    });
  }
};
