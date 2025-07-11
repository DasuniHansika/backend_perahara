// controllers/checkoutCustomerController.js
const { query } = require("../config/database-schema");

/**
 * Store checkout customer data when proceed to payment is clicked
 */
exports.storeCheckoutCustomer = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { payhereOrderId, customerInfo } = req.body;

    if (!payhereOrderId || !customerInfo) {
      return res.status(400).json({
        success: false,
        message: "PayHere Order ID and customer info are required",
      });
    }

    // Validate customer info
    const { firstName, lastName, email, phone, country } = customerInfo;
    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, and email are required",
      });
    }

    console.log("📦 Storing checkout customer for order:", payhereOrderId);
    console.log("👤 Customer info:", {
      firstName,
      lastName,
      email,
      phone,
      country,
    });

    // Check if record already exists for this order
    const existingRecord = await query(
      "SELECT id FROM checkout_customers WHERE payhere_order_id = ?",
      [payhereOrderId]
    );

    let checkoutCustomerId;

    if (existingRecord.length > 0) {
      // Update existing record
      checkoutCustomerId = existingRecord[0].id;
      await query(
        `UPDATE checkout_customers 
         SET first_name = ?, last_name = ?, email = ?, phone = ?, country = ?, 
             status = 'pending', updated_at = NOW()
         WHERE payhere_order_id = ?`,
        [
          firstName.trim(),
          lastName.trim(),
          email.trim(),
          phone ? phone.trim() : null,
          country ? country.trim() : null,
          payhereOrderId,
        ]
      );
      console.log(
        "✅ Updated existing checkout customer record:",
        checkoutCustomerId
      );
    } else {
      // Insert new record
      const result = await query(
        `INSERT INTO checkout_customers 
         (payhere_order_id, first_name, last_name, email, phone, country, status) 
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [
          payhereOrderId,
          firstName.trim(),
          lastName.trim(),
          email.trim(),
          phone ? phone.trim() : null,
          country ? country.trim() : null,
        ]
      );
      checkoutCustomerId = result.insertId;
      console.log(
        "✅ Created new checkout customer record:",
        checkoutCustomerId
      );
    }

    res.json({
      success: true,
      message: "Checkout customer data stored successfully",
      checkoutCustomerId,
      payhereOrderId,
    });
  } catch (error) {
    console.error("❌ Error storing checkout customer data:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Update checkout customer status (called after payment success/failure)
 */
exports.updateCheckoutCustomerStatus = async (req, res) => {
  try {
    const { payhereOrderId, status } = req.body;

    if (!payhereOrderId || !status) {
      return res.status(400).json({
        success: false,
        message: "PayHere Order ID and status are required",
      });
    }

    if (!["pending", "success", "failed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'pending', 'success', or 'failed'",
      });
    }

    console.log(
      `📊 Updating checkout customer status to ${status} for order:`,
      payhereOrderId
    );

    const result = await query(
      "UPDATE checkout_customers SET status = ?, updated_at = NOW() WHERE payhere_order_id = ?",
      [status, payhereOrderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Checkout customer record not found",
      });
    }

    console.log("✅ Checkout customer status updated successfully");

    res.json({
      success: true,
      message: "Checkout customer status updated successfully",
    });
  } catch (error) {
    console.error("❌ Error updating checkout customer status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Get checkout customer data by PayHere Order ID
 */
exports.getCheckoutCustomerByOrderId = async (payhereOrderId) => {
  try {
    const results = await query(
      "SELECT * FROM checkout_customers WHERE payhere_order_id = ?",
      [payhereOrderId]
    );

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error("❌ Error fetching checkout customer data:", error);
    throw error;
  }
};
