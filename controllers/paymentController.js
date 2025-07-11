// controllers/paymentController.js
const { query } = require("../config/database-schema");
const crypto = require("crypto");

/**
 * Generate MD5 hash for PayHere web payment following PayHere specification
 */
const generatePayHereHash = (
  merchantId,
  orderId,
  amount,
  currency,
  merchantSecret
) => {
  try {
    console.log(
      "🔐 PaymentController.generatePayHereHash - Generating hash for web payment"
    );

    // Step 1: Hash the merchant secret
    const hashedSecret = crypto
      .createHash("md5")
      .update(merchantSecret)
      .digest("hex")
      .toUpperCase();
    console.log(
      "📝 PaymentController.generatePayHereHash - Hashed secret generated"
    );

    // Step 2: Format amount to 2 decimal places without commas
    const formattedAmount = parseFloat(amount).toFixed(2);
    console.log(
      `💰 PaymentController.generatePayHereHash - Formatted amount: ${formattedAmount}`
    );

    // Step 3: Create hash string
    const hashString = `${merchantId}${orderId}${formattedAmount}${currency}${hashedSecret}`;
    console.log(
      `🔗 PaymentController.generatePayHereHash - Hash string created (length: ${hashString.length})`
    );

    // Step 4: Generate final hash
    const hash = crypto
      .createHash("md5")
      .update(hashString)
      .digest("hex")
      .toUpperCase();
    console.log(
      "✅ PaymentController.generatePayHereHash - Final hash generated"
    );

    return hash;
  } catch (error) {
    console.error(
      "❌ PaymentController.generatePayHereHash - Error generating hash:",
      error
    );
    throw new Error(`Failed to generate PayHere hash: ${error.message}`);
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
    // Skip logging if no userId provided
    if (!userId) {
      console.log(
        `⚠️ Skipping activity log - no user ID provided for action: ${actionType}`
      );
      return;
    }

    // Validate that the user exists before logging activity
    const userExists = await query(
      "SELECT user_id FROM users WHERE user_id = ?",
      [userId]
    );

    if (userExists.length === 0) {
      console.log(
        `⚠️ Skipping activity log - user_id ${userId} does not exist in users table`
      );
      console.log(`📋 Activity details: ${actionType} - ${description}`);
      return;
    }

    await query(
      `INSERT INTO activity_logs 
       (user_id, role, action_type, description, affected_entity_id, entity_type) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, role, actionType, description, affectedEntityId, entityType]
    );

    console.log(`✅ Activity logged for user ${userId}: ${actionType}`);
  } catch (error) {
    console.error("Error logging activity:", error);
    console.log(
      `📋 Failed activity details: userId=${userId}, action=${actionType}, description=${description}`
    );
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
 * Create a new payment for a booking
 */
exports.createPayment = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    } // Check create permission for payments table

    const { bookingId, amount, paymentMethod, payhereOrderId } = req.body;

    if (!bookingId || !amount || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Booking ID, amount, and payment method are required",
      });
    }

    // Check if booking exists
    console.log(
      "🔍 [PaymentController] Checking booking for payment, booking_id:",
      bookingId
    );
    const [booking] = await query(
      `SELECT b.*, b.customer_id as customer_user_id, 
              st.name as seat_type_name, s.name as shop_name
       FROM bookings b
       JOIN seat_types st ON b.seat_type_id = st.seat_type_id
       JOIN shops s ON b.shop_id = s.shop_id
       WHERE b.booking_id = ?`,
      [bookingId]
    );
    console.log(
      "📊 [PaymentController] Retrieved booking:",
      booking ? "Found" : "Not found"
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // If user is customer, ensure they own the booking
    // NOTE: After discussion, any user can book seats for anyone, so removing this restriction
    // if (req.user.role === "customer") {
    //   const [customer] = await query(
    //     "SELECT customer_id FROM customers WHERE user_id = ?",
    //     [req.user.id]
    //   );

    //   if (!customer || customer.customer_id !== booking.customer_id) {
    //     return res.status(403).json({
    //       success: false,
    //       message: "You can only create payments for your own bookings",
    //     });
    //   }
    // }

    // Check if payment already exists
    const [existingPayment] = await query(
      "SELECT payment_id, payhere_order_id, amount FROM payments WHERE booking_id = ?",
      [bookingId]
    );

    // Start transaction
    await beginTransaction();
    try {
      // Generate PayHere order ID if not provided
      const generatedPayhereOrderId =
        payhereOrderId ||
        `PG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      let paymentId;
      let payhereOrderIdToUse;

      if (existingPayment) {
        // Payment exists - update amount, updated_at, expires_at (5 min from now), use existing payhere_order_id
        console.log(`💳 Updating existing payment for booking ${bookingId}`);
        payhereOrderIdToUse =
          existingPayment.payhere_order_id || generatedPayhereOrderId;

        await query(
          `UPDATE payments 
           SET amount = ?, updated_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE), payhere_order_id = ?
           WHERE booking_id = ?`,
          [amount, payhereOrderIdToUse, bookingId]
        );

        paymentId = existingPayment.payment_id;
      } else {
        // Payment doesn't exist - create new payment with expires_at set to 5 minutes from now
        console.log(`💳 Creating new payment for booking ${bookingId}`);
        payhereOrderIdToUse = generatedPayhereOrderId;

        const result = await query(
          `INSERT INTO payments
           (booking_id, amount, payment_method, status, payhere_order_id, expires_at)
           VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
          [
            bookingId,
            amount,
            paymentMethod,
            "pending", // Start as pending until PayHere confirmation
            payhereOrderIdToUse,
          ]
        );

        paymentId = result.insertId;
      }

      // Keep booking status as pending until payment is confirmed
      // (payment status will be updated through client-side payment confirmation)

      // Log the activity
      await logActivity(
        req.user.id,
        req.user.role,
        existingPayment ? "payment_updated" : "payment_created",
        `${
          existingPayment ? "Updated" : "Created"
        } payment of ${amount} for booking #${bookingId} using ${paymentMethod} (Order: ${payhereOrderIdToUse})`,
        paymentId,
        "payments"
      );

      // Commit transaction
      await commitTransaction();
      return res.status(201).json({
        success: true,
        message: existingPayment
          ? "Payment updated successfully - awaiting PayHere confirmation"
          : "Payment created successfully - awaiting PayHere confirmation",
        payment: {
          paymentId,
          bookingId,
          amount,
          paymentMethod,
          status: "pending",
          payhereOrderId: payhereOrderIdToUse,
          created_at: new Date(),
        },
      });
    } catch (error) {
      // Rollback transaction if something goes wrong
      await rollbackTransaction();
      throw error;
    }
  } catch (error) {
    console.error("Error creating payment:", error);
    return res.status(500).json({
      success: false,
      message: "Error processing payment",
      error: error.message,
    });
  }
};

/**
 * Get payment details by ID
 */
exports.getPaymentById = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id: paymentId } = req.params; // Get the payment with booking information
    const [payment] = await query(
      `SELECT p.payment_id, p.booking_id, p.amount, p.payment_method, 
              p.status, 
              CASE 
                WHEN p.payhere_payment_id IS NOT NULL AND p.payhere_payment_id != '' AND p.payhere_payment_id != '0' 
                THEN p.payhere_payment_id 
                ELSE NULL 
              END as transaction_reference, 
              p.created_at,
              b.customer_id, b.shop_id, b.seat_type_id, b.day_id,
              b.quantity, b.total_price, b.status as booking_status,
              s.name as shop_name, s.street as shop_street,
              st.name as seat_type_name,
              pd.date as procession_date,
              COALESCE(c.first_name, 'Customer') as customer_first_name, 
              COALESCE(c.last_name, 'Name') as customer_last_name,
              u.email as customer_email
       FROM payments p
       JOIN bookings b ON p.booking_id = b.booking_id
       JOIN shops s ON b.shop_id = s.shop_id
       JOIN seat_types st ON b.seat_type_id = st.seat_type_id
       JOIN procession_days pd ON b.day_id = pd.day_id
       JOIN users u ON b.customer_id = u.user_id
       LEFT JOIN customers c ON u.user_id = c.user_id
       WHERE p.payment_id = ?`,
      [paymentId]
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("Error fetching payment:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching payment",
      error: error.message,
    });
  }
};

/**
 * Get all payments (with filters)
 */
exports.getAllPayments = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      status,
      shopId,
      customerId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query; // Build query conditionally based on filters
    let sql = `
      SELECT p.payment_id, p.booking_id, p.amount, p.payment_method, 
             p.status, 
             CASE 
               WHEN p.payhere_payment_id IS NOT NULL AND p.payhere_payment_id != '' AND p.payhere_payment_id != '0' 
               THEN p.payhere_payment_id 
               ELSE NULL 
             END as transaction_reference, 
             p.created_at,
             b.customer_id, b.shop_id, b.quantity, b.total_price, b.status as booking_status,
             s.name as shop_name,
             st.name as seat_type_name,
             pd.date as procession_date,
             COALESCE(c.first_name, 'Customer') as customer_first_name, 
             COALESCE(c.last_name, 'Name') as customer_last_name
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN customers c ON u.user_id = c.user_id
    `;

    const queryParams = [];
    const conditions = [];

    // Add filters to query
    if (status) {
      conditions.push("p.status = ?");
      queryParams.push(status);
    }

    if (shopId) {
      conditions.push("b.shop_id = ?");
      queryParams.push(shopId);
    }

    if (customerId) {
      conditions.push("b.customer_id = ?");
      queryParams.push(customerId);
    }

    if (startDate) {
      conditions.push("p.created_at >= ?");
      queryParams.push(startDate);
    }

    if (endDate) {
      conditions.push("p.created_at <= ?");
      queryParams.push(endDate);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    // Add sorting
    sql += " ORDER BY p.created_at DESC";

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += " LIMIT ? OFFSET ?";
    queryParams.push(parseInt(limit), offset);

    // Get total count for pagination
    let countSql = `
      SELECT COUNT(*) as total
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
    `;

    if (conditions.length > 0) {
      countSql += " WHERE " + conditions.join(" AND ");
    }

    const [countResult] = await query(countSql, queryParams.slice(0, -2));
    const totalItems = countResult.total;
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    const payments = await query(sql, queryParams);

    return res.status(200).json({
      success: true,
      totalItems,
      totalPages,
      currentPage: parseInt(page),
      pageSize: parseInt(limit),
      payments,
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
    });
  }
};

/**
 * Get payments for a specific customer
 */
exports.getCustomerPayments = async (req, res, customerId = null) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { page = 1, limit = 20 } = req.query;

    // If customerId is not provided, get it from the current user
    if (!customerId) {
      if (req.user.role !== "customer") {
        return res.status(403).json({
          success: false,
          message: "Unauthorized to view customer payments",
        });
      }

      // After migration, bookings.customer_id directly references users.user_id
      // So we can use req.user.id directly instead of looking up customer_id
      customerId = req.user.id;
    } else {
      // If customerId is provided, ensure user is authorized to view it
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        // If user is customer, ensure they're viewing their own payments
        if (req.user.role === "customer") {
          if (customerId !== req.user.id) {
            return res.status(403).json({
              success: false,
              message: "You can only view your own payments",
            });
          }
        } else {
          return res.status(403).json({
            success: false,
            message: "Unauthorized to view customer payments",
          });
        }
      }
    }
    const sql = `
      SELECT p.payment_id, p.booking_id, p.amount, p.payment_method, 
             p.status, p.payhere_payment_id as transaction_reference, 
             p.created_at,
             b.shop_id, b.quantity, b.total_price, b.status as booking_status,
             s.name as shop_name,
             st.name as seat_type_name,
             pd.date as procession_date
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      WHERE b.customer_id = ? 
        AND p.status = 'success' 
        AND p.payhere_payment_id IS NOT NULL 
        AND p.payhere_payment_id != '' 
        AND p.payhere_payment_id != '0'
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const payments = await query(sql, [customerId, parseInt(limit), offset]); // Get total count for pagination
    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM payments p 
       JOIN bookings b ON p.booking_id = b.booking_id 
       WHERE b.customer_id = ? 
         AND p.status = 'success' 
         AND p.payhere_payment_id IS NOT NULL 
         AND p.payhere_payment_id != '' 
         AND p.payhere_payment_id != '0'`,
      [customerId]
    );

    const totalItems = countResult.total;
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    return res.status(200).json({
      success: true,
      totalItems,
      totalPages,
      currentPage: parseInt(page),
      pageSize: parseInt(limit),
      payments,
    });
  } catch (error) {
    console.error("Error fetching customer payments:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customer payments",
      error: error.message,
    });
  }
};

/**
 * Get payments for a specific seller's shops
 */
exports.getSellerPayments = async (req, res, sellerId = null) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { shopId, startDate, endDate, page = 1, limit = 20 } = req.query;

    // If sellerId is not provided, get it from the current user
    if (!sellerId) {
      if (req.user.role !== "seller") {
        return res.status(403).json({
          success: false,
          message: "Unauthorized to view seller payments",
        });
      }

      // Get seller ID for the current user
      const [seller] = await query(
        "SELECT seller_id FROM sellers WHERE user_id = ?",
        [req.user.id]
      );

      if (!seller) {
        return res.status(404).json({
          success: false,
          message: "Seller profile not found",
        });
      }

      sellerId = seller.seller_id;
    } else {
      // If sellerId is provided, ensure user is authorized to view it
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        if (req.user.role === "seller") {
          const [seller] = await query(
            "SELECT seller_id FROM sellers WHERE user_id = ?",
            [req.user.id]
          );

          if (!seller || seller.seller_id !== parseInt(sellerId)) {
            return res.status(403).json({
              success: false,
              message: "You can only view your own shops' payments",
            });
          }
        } else {
          return res.status(403).json({
            success: false,
            message: "Unauthorized to view seller payments",
          });
        }
      }
    } // Build query conditionally based on filters
    let sql = `
      SELECT p.payment_id, p.booking_id, p.amount, p.payment_method, 
             p.status, 
             p.payhere_payment_id as transaction_reference, 
             p.created_at,
             b.shop_id, b.quantity, b.total_price, b.status as booking_status,
             s.name as shop_name,
             st.name as seat_type_name,
             pd.date as procession_date,
             c.first_name as customer_first_name, c.last_name as customer_last_name
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      JOIN users u ON b.customer_id = u.user_id
      JOIN customers c ON u.user_id = c.user_id
      WHERE s.seller_id = ?
        AND p.status = 'success'
        AND b.status = 'confirmed'
        AND p.payhere_payment_id IS NOT NULL 
        AND p.payhere_payment_id != '' 
        AND p.payhere_payment_id != '0'
    `;

    const queryParams = [sellerId];

    // Add more filters
    if (shopId) {
      sql += " AND b.shop_id = ?";
      queryParams.push(shopId);
    }

    if (startDate) {
      sql += " AND p.created_at >= ?";
      queryParams.push(startDate);
    }

    if (endDate) {
      sql += " AND p.created_at <= ?";
      queryParams.push(endDate);
    }

    // Add sorting and pagination
    sql += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
    const offset = (parseInt(page) - 1) * parseInt(limit);
    queryParams.push(parseInt(limit), offset); // Get total count for pagination
    let countSql = `
      SELECT COUNT(*) as total
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN shops s ON b.shop_id = s.shop_id
      WHERE s.seller_id = ?
        AND p.status = 'success'
        AND b.status = 'confirmed'
        AND p.payhere_payment_id IS NOT NULL 
        AND p.payhere_payment_id != '' 
        AND p.payhere_payment_id != '0'
    `;

    const countParams = [sellerId];

    if (shopId) {
      countSql += " AND b.shop_id = ?";
      countParams.push(shopId);
    }

    if (startDate) {
      countSql += " AND p.created_at >= ?";
      countParams.push(startDate);
    }

    if (endDate) {
      countSql += " AND p.created_at <= ?";
      countParams.push(endDate);
    }

    const [countResult] = await query(countSql, countParams);
    const totalItems = countResult.total;
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    const payments = await query(sql, queryParams);

    return res.status(200).json({
      success: true,
      totalItems,
      totalPages,
      currentPage: parseInt(page),
      pageSize: parseInt(limit),
      payments,
    });
  } catch (error) {
    console.error("Error fetching seller payments:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seller payments",
      error: error.message,
    });
  }
};

/**
 * Get payments by booking ID
 */
exports.getPaymentsByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if booking exists and get booking info
    const bookingResults = await query(
      `
      SELECT b.booking_id, b.customer_id, s.seller_id, u.user_id as customer_user_id
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN users u ON b.customer_id = u.user_id
      WHERE b.booking_id = ?
      `,
      [bookingId]
    );

    if (bookingResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }
    const booking = bookingResults[0];

    const payments = await query(
      `
      SELECT p.payment_id, p.amount, p.payment_method, p.status, 
             CASE 
               WHEN p.payhere_payment_id IS NOT NULL AND p.payhere_payment_id != '' AND p.payhere_payment_id != '0' 
               THEN p.payhere_payment_id 
               ELSE NULL 
             END as transaction_reference, 
             p.created_at,
             b.quantity, b.total_price, b.status as booking_status
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      WHERE p.booking_id = ?
      ORDER BY p.created_at DESC
      `,
      [bookingId]
    );

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Error fetching payments by booking ID:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
    });
  }
};

/**
 * Get payments by user ID
 */
exports.getPaymentsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Users can only see their own payments unless they are admin
    if (req.user.role === "customer" && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You can only view your own payments",
      });
    }

    // For sellers, they should use getSellerPayments instead
    if (req.user.role === "seller") {
      return res.status(400).json({
        success: false,
        message: "Sellers should use the seller payments endpoint",
      });
    }

    // Get customer ID from user ID
    // After migration, bookings.customer_id directly references users.user_id
    // So we can use userId directly instead of looking up customer_id
    const customerId = parseInt(userId);
    const payments = await query(
      `
      SELECT p.payment_id, p.amount, p.payment_method, p.status, 
             CASE 
               WHEN p.payhere_payment_id IS NOT NULL AND p.payhere_payment_id != '' AND p.payhere_payment_id != '0' 
               THEN p.payhere_payment_id 
               ELSE NULL 
             END as transaction_reference, 
             p.created_at,
             b.booking_id, b.quantity, b.total_price, b.status as booking_status,
             s.name as shop_name, st.name as seat_type_name,
             pd.date as procession_date
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      WHERE b.customer_id = ?
      ORDER BY p.created_at DESC
      `,
      [customerId]
    );

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Error fetching payments by user ID:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
    });
  }
};

/**
 * Get payments by date range
 */
exports.getPaymentsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, status, paymentMethod } = req.query;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!["admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Admin access required",
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }
    let sql = `
      SELECT p.payment_id, p.amount, p.payment_method, p.status, 
             CASE 
               WHEN p.payhere_payment_id IS NOT NULL AND p.payhere_payment_id != '' AND p.payhere_payment_id != '0' 
               THEN p.payhere_payment_id 
               ELSE NULL 
             END as transaction_reference, 
             p.created_at,
             b.booking_id, b.quantity, b.total_price, b.status as booking_status,
             s.name as shop_name, st.name as seat_type_name,
             pd.date as procession_date,
             COALESCE(c.first_name, 'Customer') as customer_first_name, 
             COALESCE(c.last_name, 'Name') as customer_last_name
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN customers c ON u.user_id = c.user_id
      WHERE p.created_at >= ? AND p.created_at <= ?
    `;

    const queryParams = [startDate, endDate];

    // Add optional filters
    if (status) {
      sql += " AND p.status = ?";
      queryParams.push(status);
    }

    if (paymentMethod) {
      sql += " AND p.payment_method = ?";
      queryParams.push(paymentMethod);
    }

    sql += " ORDER BY p.created_at DESC";

    const payments = await query(sql, queryParams);

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Error fetching payments by date range:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
    });
  }
};

/**
 * Update payment status
 */
exports.updatePaymentStatus = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Only admins can update payment status
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can update payment status",
      });
    }

    const { id: paymentId } = req.params;
    const { status, transactionReference } = req.body;

    if (
      !status ||
      !["pending", "success", "failed", "refunded"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid status. Must be one of: pending, success, failed, refunded",
      });
    }

    // Check if payment exists
    const [payment] = await query(
      `SELECT p.*, b.booking_id, b.status as booking_status,
              st.name as seat_type_name, s.name as shop_name
       FROM payments p
       JOIN bookings b ON p.booking_id = b.booking_id
       JOIN seat_types st ON b.seat_type_id = st.seat_type_id
       JOIN shops s ON b.shop_id = s.shop_id
       WHERE p.payment_id = ?`,
      [paymentId]
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Start transaction
    await beginTransaction();

    try {
      // Update payment status
      const updateSql = transactionReference
        ? "UPDATE payments SET status = ?, payhere_payment_id = ? WHERE payment_id = ?"
        : "UPDATE payments SET status = ? WHERE payment_id = ?";

      const updateParams = transactionReference
        ? [status, transactionReference, paymentId]
        : [status, paymentId];

      await query(updateSql, updateParams);

      // Update booking status based on payment status
      let bookingStatus;
      switch (status) {
        case "success":
          bookingStatus = "confirmed";
          break;
        case "failed":
          bookingStatus = "pending";
          break;
        case "refunded":
          bookingStatus = "cancelled";
          break;
        default:
          bookingStatus = payment.booking_status; // Keep current status
      }

      // Update booking if status is changing
      if (bookingStatus !== payment.booking_status) {
        await query("UPDATE bookings SET status = ? WHERE booking_id = ?", [
          bookingStatus,
          payment.booking_id,
        ]);
      }

      // Log the activity
      await logActivity(
        req.user.id,
        req.user.role,
        "payment_status_updated",
        `Updated payment #${paymentId} status from ${payment.status} to ${status} for ${payment.seat_type_name} at ${payment.shop_name}`,
        paymentId,
        "payments"
      );

      // Commit transaction
      await commitTransaction();

      return res.status(200).json({
        success: true,
        message: `Payment status updated to ${status} successfully`,
      });
    } catch (error) {
      // Rollback transaction if something goes wrong
      await rollbackTransaction();
      throw error;
    }
  } catch (error) {
    console.error("Error updating payment status:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating payment status",
      error: error.message,
    });
  }
};

/**
 * Update payment
 */
exports.updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transactionReference } = req.body;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (
      !status ||
      !["pending", "success", "failed", "refunded"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
      });
    }

    // Get payment details
    const paymentResults = await query(
      `
      SELECT p.payment_id, p.status as current_status, p.booking_id,
             b.customer_id, s.seller_id, u.user_id as customer_user_id
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN users u ON b.customer_id = u.user_id
      WHERE p.payment_id = ?
      `,
      [id]
    );

    if (paymentResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }
    const payment = paymentResults[0];

    // Prevent invalid status transitions
    if (payment.current_status === "success" && status === "pending") {
      return res.status(400).json({
        success: false,
        message: "Cannot change successful payment back to pending",
      });
    }

    if (payment.current_status === "refunded" && status !== "refunded") {
      return res.status(400).json({
        success: false,
        message: "Cannot change refunded payment status",
      });
    } // Build update query
    const updateData = { status };
    if (transactionReference) {
      updateData.payhere_payment_id = transactionReference;
    }

    const setClause = Object.keys(updateData)
      .map((key) => `${key} = ?`)
      .join(", ");

    const values = Object.values(updateData);
    values.push(id);

    await query(
      `UPDATE payments SET ${setClause} WHERE payment_id = ?`,
      values
    );

    // If payment is successful, update booking status
    if (status === "success") {
      await query(
        "UPDATE bookings SET status = 'confirmed' WHERE booking_id = ?",
        [payment.booking_id]
      );
    }

    // If payment failed, you might want to update booking status too
    if (status === "failed") {
      await query(
        "UPDATE bookings SET status = 'cancelled' WHERE booking_id = ?",
        [payment.booking_id]
      );
    }

    // Log activity
    await logActivity(
      req.user.id,
      req.user.role,
      "payment_updated",
      `Updated payment ${id} status to ${status}`,
      id,
      "payment"
    );

    return res.status(200).json({
      success: true,
      message: "Payment updated successfully",
      payment: { payment_id: parseInt(id), status },
    });
  } catch (error) {
    console.error("Error updating payment:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating payment",
      error: error.message,
    });
  }
};

/**
 * Delete payment (admin only)
 */
exports.deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Only admin/super_admin can delete payments
    if (!["admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Admin access required",
      });
    }

    // Check if payment exists
    const paymentResults = await query(
      "SELECT payment_id, booking_id, status FROM payments WHERE payment_id = ?",
      [id]
    );

    if (paymentResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const payment = paymentResults[0];

    // Don't allow deletion of successful payments without refund
    if (payment.status === "success") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete successful payment. Process refund instead.",
      });
    }

    // Begin transaction
    await beginTransaction();

    try {
      // Delete the payment
      await query("DELETE FROM payments WHERE payment_id = ?", [id]);

      // Update booking status if needed
      if (payment.status === "pending") {
        await query(
          "UPDATE bookings SET status = 'pending' WHERE booking_id = ?",
          [payment.booking_id]
        );
      }

      // Log activity
      await logActivity(
        req.user.id,
        req.user.role,
        "payment_deleted",
        `Deleted payment ${id}`,
        id,
        "payment"
      );

      // Commit transaction
      await commitTransaction();

      return res.status(200).json({
        success: true,
        message: "Payment deleted successfully",
      });
    } catch (error) {
      // Rollback transaction on error
      await rollbackTransaction();
      throw error;
    }
  } catch (error) {
    console.error("Error deleting payment:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting payment",
      error: error.message,
    });
  }
};

/**
 * Get seller payment history with hierarchical structure
 * Groups by transaction_reference -> event_date -> seat_types
 */
exports.getSellerPaymentHistory = async (req, res) => {
  try {
    console.log("getSellerPaymentHistory called");
    console.log(
      "Request user:",
      req.user ? { id: req.user.id, role: req.user.role } : "No user"
    );

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { page = 1, limit = 20, startDate, endDate, shopId } = req.query;
    console.log("Query params:", { page, limit, startDate, endDate, shopId });

    // Get seller ID for the current user
    let sellerId;
    if (req.user.role === "seller") {
      const [seller] = await query(
        "SELECT seller_id FROM sellers WHERE user_id = ?",
        [req.user.id]
      );

      if (!seller) {
        console.log("No seller profile found for user ID:", req.user.id);
        return res.status(404).json({
          success: false,
          message: "Seller profile not found",
        });
      }
      sellerId = seller.seller_id;
      console.log("Found seller ID:", sellerId);
    } else if (["admin", "super_admin"].includes(req.user.role)) {
      // Admin can access any seller's payment history if sellerId is provided
      sellerId = req.query.sellerId;
      if (!sellerId) {
        return res.status(400).json({
          success: false,
          message: "Seller ID is required for admin access",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to view seller payment history",
      });
    }

    // If shopId is provided, validate that the seller owns the shop
    if (shopId) {
      const [shop] = await query(
        "SELECT shop_id, name FROM shops WHERE shop_id = ? AND seller_id = ?",
        [shopId, sellerId]
      );

      if (!shop) {
        console.log(
          `Shop ${shopId} not found or not owned by seller ${sellerId}`
        );
        return res.status(404).json({
          success: false,
          message: "Shop not found or you don't have access to this shop",
        });
      }
      console.log(`Shop validation passed: ${shop.name} (ID: ${shop.shop_id})`);
    } // Build the query to get payment data from your actual database structure
    let sql = `
      SELECT 
        p.payment_id,
        p.payhere_payment_id,
        p.payhere_payment_id as transaction_reference,
        p.amount,
        p.payment_method,
        p.status,
        p.created_at as payment_date,
        b.booking_id,
        b.quantity,
        b.total_price,
        b.day_id,
        pd.date as event_date,
        st.seat_type_id,
        st.name as seat_type_name,
        COALESCE(c.first_name, u.username, 'User') as customer_first_name,
        COALESCE(c.last_name, '', '') as customer_last_name,
        s.shop_id,
        s.name as shop_name,
        sta.price as unit_price
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN customers c ON u.user_id = c.user_id
      JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id AND b.day_id = sta.day_id
      WHERE s.seller_id = ?
        AND p.status = 'success'
        AND b.status = 'confirmed'
        AND p.payhere_payment_id IS NOT NULL 
        AND p.payhere_payment_id != '' 
        AND p.payhere_payment_id != '0'
    `;

    const queryParams = [sellerId];

    // Add shop filter if provided
    if (shopId) {
      sql += " AND s.shop_id = ?";
      queryParams.push(shopId);
    }

    // Add date filters if provided
    if (startDate) {
      sql += " AND p.created_at >= ?";
      queryParams.push(startDate);
    }

    if (endDate) {
      sql += " AND p.created_at <= ?";
      queryParams.push(endDate);
    }

    // Order by payment creation date (newest first)
    sql += " ORDER BY p.created_at DESC";

    console.log("Executing SQL:", sql);
    console.log("With params:", queryParams); // Get all payments (we'll handle pagination after grouping)
    const allPayments = await query(sql, queryParams);
    console.log(`Found ${allPayments.length} payment records`);
    // Debug: Log sample transaction references
    if (allPayments.length > 0) {
      console.log("📋 Sample transaction references:");
      allPayments.slice(0, 3).forEach((payment, index) => {
        console.log(
          `  ${index + 1}. payment_id=${
            payment.payment_id
          }, payhere_payment_id='${
            payment.payhere_payment_id
          }', transaction_reference='${payment.transaction_reference}'`
        );
      });
    } else {
      console.log("📋 No payments found with valid payhere_payment_id");
      // Let's check what payments exist without the filter
      let debugQuery = `
        SELECT p.payment_id, p.payhere_payment_id, p.status, p.created_at,
               s.seller_id, s.shop_id, s.name as shop_name
        FROM payments p
        JOIN bookings b ON p.booking_id = b.booking_id
        JOIN shops s ON b.shop_id = s.shop_id
        WHERE s.seller_id = ? AND p.status = 'success'
      `;
      const debugParams = [sellerId];

      if (shopId) {
        debugQuery += " AND s.shop_id = ?";
        debugParams.push(shopId);
      }

      debugQuery += " LIMIT 5";

      const debugPayments = await query(debugQuery, debugParams);
      console.log(
        "📋 Debug - Sample payments without payhere_payment_id filter:"
      );
      debugPayments.forEach((payment, index) => {
        console.log(
          `  ${index + 1}. payment_id=${
            payment.payment_id
          }, payhere_payment_id='${payment.payhere_payment_id}', status=${
            payment.status
          }`
        );
      });
    }

    if (allPayments.length === 0) {
      console.log("No payments found, returning empty result");
      return res.status(200).json({
        success: true,
        total_items: 0,
        total_pages: 0,
        current_page: parseInt(page),
        page_size: parseInt(limit),
        payments: [],
      });
    } // Transform data into hierarchical structure
    const paymentGroups = {};
    allPayments.forEach((row) => {
      // Use the transaction_reference from SQL query (it's always populated now)
      const referenceNumber = row.transaction_reference;

      // Debug log for this payment record
      console.log(
        `📋 Processing payment_id=${row.payment_id}, payhere_payment_id='${row.payhere_payment_id}', reference='${referenceNumber}'`
      );

      if (!paymentGroups[referenceNumber]) {
        paymentGroups[referenceNumber] = {
          reference_number: referenceNumber,
          customer_name:
            `${row.customer_first_name} ${row.customer_last_name}`.trim(),
          payment_date: row.payment_date,
          payment_info: {
            payment_method: row.payment_method,
            status: row.status,
            transaction_date: row.payment_date,
          },
          event_dates: {},
          total_amount: 0,
        };
      }

      const eventDateKey = new Date(row.event_date).toISOString().split("T")[0];

      if (!paymentGroups[referenceNumber].event_dates[eventDateKey]) {
        paymentGroups[referenceNumber].event_dates[eventDateKey] = {
          event_date: row.event_date,
          seat_types: {},
          event_date_subtotal: 0,
        };
      }

      const seatTypeKey = row.seat_type_id;

      if (
        !paymentGroups[referenceNumber].event_dates[eventDateKey].seat_types[
          seatTypeKey
        ]
      ) {
        paymentGroups[referenceNumber].event_dates[eventDateKey].seat_types[
          seatTypeKey
        ] = {
          seat_type_id: row.seat_type_id.toString(),
          seat_type_name: row.seat_type_name,
          quantity: 0,
          unit_price: parseFloat(row.unit_price) || 0,
          subtotal: 0,
        };
      }

      // Aggregate quantities and calculate totals
      const seatType =
        paymentGroups[referenceNumber].event_dates[eventDateKey].seat_types[
          seatTypeKey
        ];
      seatType.quantity += row.quantity;
      seatType.subtotal += parseFloat(row.amount);

      paymentGroups[referenceNumber].event_dates[
        eventDateKey
      ].event_date_subtotal += parseFloat(row.amount);
      paymentGroups[referenceNumber].total_amount += parseFloat(row.amount);
    });

    console.log(
      `📊 Processed ${Object.keys(paymentGroups).length} unique payment groups`
    );
    console.log(
      `📋 Processing summary - Total records: ${
        allPayments.length
      }, Processed: ${Object.keys(paymentGroups).length} groups`
    );

    // Convert grouped data to array format
    const paymentCards = Object.values(paymentGroups).map((group) => ({
      reference_number: group.reference_number,
      customer_name: group.customer_name,
      total_amount: group.total_amount,
      payment_date: group.payment_date,
      payment_info: group.payment_info,
      event_date_groups: Object.values(group.event_dates).map((eventDate) => ({
        event_date: eventDate.event_date,
        event_date_subtotal: eventDate.event_date_subtotal,
        seat_type_details: Object.values(eventDate.seat_types),
      })),
    }));

    // Sort by payment date (newest first)
    paymentCards.sort(
      (a, b) => new Date(b.payment_date) - new Date(a.payment_date)
    );

    // Apply pagination
    const totalItems = paymentCards.length;
    const totalPages = Math.ceil(totalItems / parseInt(limit));
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginatedPayments = paymentCards.slice(
      offset,
      offset + parseInt(limit)
    );

    console.log(
      `Returning ${paginatedPayments.length} payments out of ${totalItems} total`
    );

    // Log activity
    const activityDescription = shopId
      ? `Viewed payment history for shop ${shopId} (${totalItems} records)`
      : `Viewed seller payment history (${totalItems} records)`;

    await logActivity(
      req.user.id,
      req.user.role,
      "view_seller_payment_history",
      activityDescription,
      sellerId,
      "seller"
    );

    return res.status(200).json({
      success: true,
      total_items: totalItems,
      total_pages: totalPages,
      current_page: parseInt(page),
      page_size: parseInt(limit),
      payments: paginatedPayments,
    });
  } catch (error) {
    console.error("Error fetching seller payment history:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seller payment history",
      error: error.message,
    });
  }
};

/**
 * Create payments for multiple bookings (one order with several seat items)
 */
exports.createPaymentsForOrder = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { bookingIds, paymentMethod, payhereOrderId } = req.body;

    if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Booking IDs array is required",
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Payment method is required",
      });
    }

    // Generate PayHere order ID for this order (one order can have several seat items)
    const generatedPayhereOrderId =
      payhereOrderId ||
      `PG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Verify all bookings exist and belong to the user (if customer)
    const bookingsQuery = `
      SELECT b.*, u.user_id as customer_user_id, 
             st.name as seat_type_name, s.name as shop_name
      FROM bookings b
      JOIN users u ON b.customer_id = u.user_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN shops s ON b.shop_id = s.shop_id
      WHERE b.booking_id IN (${bookingIds.map(() => "?").join(",")})
    `;

    const bookings = await query(bookingsQuery, bookingIds);

    if (bookings.length !== bookingIds.length) {
      return res.status(404).json({
        success: false,
        message: "Some bookings not found",
      });
    }

    // If user is customer, ensure they own all bookings
    // NOTE: After discussion, any user can book seats for anyone, so removing this restriction
    // if (req.user.role === "customer") {
    //   const [customer] = await query(
    //     "SELECT customer_id FROM customers WHERE user_id = ?",
    //     [req.user.id]
    //   );

    //   if (!customer) {
    //     return res.status(403).json({
    //       success: false,
    //       message: "Customer profile not found",
    //     });
    //   }

    //   const invalidBookings = bookings.filter(
    //     (booking) => booking.customer_id !== customer.customer_id
    //   );
    //   if (invalidBookings.length > 0) {
    //     return res.status(403).json({
    //       success: false,
    //       message: "You can only create payments for your own bookings",
    //     });
    //   }
    // }

    // Start transaction
    await beginTransaction();

    try {
      const createdPayments = [];
      let totalAmount = 0;
      let orderPayhereId = generatedPayhereOrderId; // Track the order ID to return

      // Create payment record for each booking with the same PayHere order ID
      for (const booking of bookings) {
        // Check if payment already exists for this booking
        const [existingPayment] = await query(
          `SELECT payment_id, payhere_order_id, amount FROM payments WHERE booking_id = ?`,
          [booking.booking_id]
        );

        let paymentId;
        let payhereOrderIdToUse;

        if (existingPayment) {
          // Payment exists - update amount, updated_at, expires_at (5 min from now), use existing payhere_order_id
          console.log(
            `💳 Updating existing payment for booking ${booking.booking_id}`
          );
          payhereOrderIdToUse =
            existingPayment.payhere_order_id || generatedPayhereOrderId;

          // If this is the first payment we're processing, use its order ID for the response
          if (createdPayments.length === 0) {
            orderPayhereId = payhereOrderIdToUse;
          }

          await query(
            `UPDATE payments 
             SET amount = ?, updated_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE), payhere_order_id = ?
             WHERE booking_id = ?`,
            [booking.total_price, payhereOrderIdToUse, booking.booking_id]
          );

          paymentId = existingPayment.payment_id;
        } else {
          // Payment doesn't exist - create new payment with expires_at set to 5 minutes from now
          console.log(
            `💳 Creating new payment for booking ${booking.booking_id}`
          );
          payhereOrderIdToUse = generatedPayhereOrderId;

          const result = await query(
            `INSERT INTO payments
             (booking_id, amount, payment_method, status, payhere_order_id, expires_at)
             VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
            [
              booking.booking_id,
              booking.total_price,
              paymentMethod,
              "pending", // Start as pending until PayHere confirmation
              payhereOrderIdToUse,
            ]
          );

          paymentId = result.insertId;
        }

        totalAmount += parseFloat(booking.total_price);

        createdPayments.push({
          paymentId,
          bookingId: booking.booking_id,
          amount: booking.total_price,
          seatTypeName: booking.seat_type_name,
          shopName: booking.shop_name,
        });

        // Log the activity
        await logActivity(
          req.user.id,
          req.user.role,
          "payment_created",
          `Created payment of ${booking.total_price} for booking #${booking.booking_id} using ${paymentMethod} (Order: ${generatedPayhereOrderId})`,
          paymentId,
          "payments"
        );
      }

      // Commit transaction
      await commitTransaction();

      return res.status(201).json({
        success: true,
        message:
          "Payments created/updated successfully for multiple bookings - awaiting PayHere confirmation",
        order: {
          payhereOrderId: orderPayhereId,
          totalAmount,
          paymentMethod,
          payments: createdPayments,
          created_at: new Date(),
        },
      });
    } catch (error) {
      // Rollback transaction if something goes wrong
      await rollbackTransaction();
      throw error;
    }
  } catch (error) {
    console.error("Error creating payments for order:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating payments for order",
      error: error.message,
    });
  }
};

/**
 * Get PayHere payment request data for multi-item checkout (order with multiple bookings)
 */
exports.getPayHerePaymentDataForOrder = async (req, res) => {
  try {
    const { payhereOrderId } = req.params;
    const userId = req.user.id; // Firebase user ID
    const userRole = req.user.role;

    console.log(
      `💰 getPayHerePaymentDataForOrder - Starting for order: ${payhereOrderId}, user: ${userId}, role: ${userRole}`
    );

    // Get all payments and bookings for this order
    const paymentsQuery = `
      SELECT 
        p.payment_id,
        p.booking_id,
        p.amount,
        p.status as payment_status,
        b.customer_id,
        b.shop_id,
        b.seat_type_id,
        b.day_id,
        b.quantity,
        b.total_price,
        b.status as booking_status,
        COALESCE(c.first_name, 'Customer') as first_name,
        COALESCE(c.last_name, 'Name') as last_name,
        u.user_id as customer_user_id,
        u.email as customer_email,
        u.mobile_number as phone,
        s.name as shop_name,
        st.name as seat_type_name,
        pd.date as procession_date,
        pd.event_name as day_name
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN customers c ON u.user_id = c.user_id
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      WHERE (p.payhere_order_id = ? OR p.payhere_payment_id = ?)
      ORDER BY p.payment_id
    `;

    const payments = await query(paymentsQuery, [
      payhereOrderId,
      payhereOrderId,
    ]);

    if (payments.length === 0) {
      console.log(
        `❌ getPayHerePaymentDataForOrder - No payments found for order: ${payhereOrderId}`
      );
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Note: Removed customer security check to allow users to pay for anyone's orders
    // This allows customers to pay for bookings made by other users
    console.log(
      `💳 getPayHerePaymentDataForOrder - Allowing payment for order by user: ${userId} (${userRole})`
    );

    // Check if any payment is already successful
    const successfulPayments = payments.filter(
      (p) => p.payment_status === "success"
    );
    if (successfulPayments.length > 0) {
      console.log(
        `❌ getPayHerePaymentDataForOrder - Payment already completed for order: ${payhereOrderId}`
      );
      return res.status(400).json({
        success: false,
        message: "Payment already completed for this order",
      });
    }

    // Calculate total amount from all payments in the order
    const totalAmount = payments.reduce(
      (sum, payment) => sum + parseFloat(payment.amount),
      0
    );

    // Use the first payment's customer info (all should be the same customer)
    const firstPayment = payments[0]; // Prepare PayHere payment data with only required fields
    console.log(
      `🔧 getPayHerePaymentDataForOrder - Preparing PayHere payment data for ${payments.length} items`
    );

    // Determine if this is for web or mobile platform based on request headers or explicit parameter
    const isWebPayment =
      req.headers["user-agent"]?.includes("Mozilla") ||
      req.query.platform === "web";
    const merchantSecret = isWebPayment
      ? process.env.PAYHERE_WEB_MERCHANT_SECRET
      : process.env.PAYHERE_MOBILE_MERCHANT_SECRET;

    console.log(
      `🌐 getPayHerePaymentDataForOrder - Platform detected: ${
        isWebPayment ? "Web" : "Mobile"
      }`
    );

    const paymentData = {
      sandbox: process.env.PAYHERE_SANDBOX === "true",
      merchant_id: process.env.PAYHERE_MERCHANT_ID || "1230935",
      notify_url:
        process.env.PAYHERE_NOTIFY_URL ||
        `${req.protocol}://${req.get("host")}/api/payments/payhere/notify`,
      // Web-specific URLs for payment completion handling
      return_url:
        process.env.PAYHERE_RETURN_URL ||
        `${req.protocol}://${req.get("host")}/payment-success`,
      cancel_url:
        process.env.PAYHERE_CANCEL_URL ||
        `${req.protocol}://${req.get("host")}/payment-failed`,
      order_id: payhereOrderId,
      items: `${payments.length} seat items`, // Multiple items description
      currency: "LKR",
      amount: totalAmount.toFixed(2), // Total amount for all bookings
      first_name: "Customer", // Generic value - will use checkout form data
      last_name: "Name", // Generic value - will use checkout form data
      email: "customer@example.com", // Generic value - will use checkout form data
      phone: "", // Generic value - will use checkout form data
      country: "Sri Lanka", // Default country
    };

    // Generate hash for web payments
    if (isWebPayment) {
      console.log(
        "🔐 getPayHerePaymentDataForOrder - Generating hash for web payment"
      );
      paymentData.hash = generatePayHereHash(
        paymentData.merchant_id,
        paymentData.order_id,
        paymentData.amount,
        paymentData.currency,
        merchantSecret
      );
      console.log(
        "✅ getPayHerePaymentDataForOrder - Hash generated for web payment"
      );
    } else {
      // For mobile payments, include merchant secret for SDK
      paymentData.merchant_secret = merchantSecret;
      console.log(
        "📱 getPayHerePaymentDataForOrder - Merchant secret included for mobile payment"
      );
    }
    console.log(`💰 getPayHerePaymentDataForOrder - Payment data prepared:`);
    console.log(`  - Sandbox Mode: ${paymentData.sandbox}`);
    console.log(`  - Merchant ID: ${paymentData.merchant_id}`);
    console.log(`  - Order ID: ${paymentData.order_id}`);
    console.log(`  - Return URL: ${paymentData.return_url}`);
    console.log(`  - Cancel URL: ${paymentData.cancel_url}`);
    console.log(
      `  - Total Amount: ${paymentData.amount} ${paymentData.currency} (${payments.length} items)`
    );
    console.log(`  - Customer: Generic (will use checkout form data)`);
    console.log(`  - Email: Generic (will use checkout form data)`);
    console.log(`  - Phone: Generic (will use checkout form data)`);
    console.log(`  - Country: ${paymentData.country}`);

    // Log activity
    const bookingList = payments
      .map((p) => `${p.booking_id}(${p.shop_name}-${p.seat_type_name})`)
      .join(", ");
    console.log(
      `📝 getPayHerePaymentDataForOrder - Logging activity for user: ${userId}`
    );
    await logActivity(
      userId,
      userRole,
      "multi_payment_request",
      `Multi-item payment request generated for order ${payhereOrderId} with ${payments.length} bookings: ${bookingList}`,
      null, // PayHere order ID is string, not integer - store in description only
      "order"
    );

    console.log(
      `✅ getPayHerePaymentDataForOrder - Successfully prepared payment data for order: ${payhereOrderId}`
    );
    res.json({
      success: true,
      message: "Multi-item payment data retrieved successfully",
      data: paymentData,
      order_summary: {
        order_id: payhereOrderId,
        total_amount: totalAmount,
        item_count: payments.length,
        bookings: payments.map((p) => ({
          booking_id: p.booking_id,
          amount: p.amount,
          seat_type: p.seat_type_name,
          shop: p.shop_name,
          quantity: p.quantity,
          event_date: formatDateString(p.procession_date),
        })),
      },
    });
  } catch (error) {
    console.error(`❌ getPayHerePaymentDataForOrder - Error occurred:`, error);
    res.status(500).json({
      success: false,
      message: "Error getting multi-item payment data",
      error: error.message,
    });
  }
};

/**
 * Get PayHere payment request data for checkout - Objective 3
 */
exports.getPayHerePaymentData = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id; // Firebase user ID
    const userRole = req.user.role;

    console.log(
      `💰 getPayHerePaymentData - Starting for booking: ${bookingId}, user: ${userId}, role: ${userRole}`
    );

    // Get booking details with customer information
    const bookingQuery = `
      SELECT 
        b.booking_id,
        b.customer_id,
        b.shop_id,
        b.seat_type_id,
        b.day_id,
        b.quantity,
        b.total_price,
        b.status,
        COALESCE(c.first_name, 'Customer') as first_name,
        COALESCE(c.last_name, 'Name') as last_name,
        u.email as customer_email,
        u.mobile_number as phone,
        s.name as shop_name,
        st.name as seat_type_name,
        pd.date as procession_date,
        pd.event_name as day_name
      FROM bookings b
      JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN customers c ON u.user_id = c.user_id
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      WHERE b.booking_id = ?
    `;

    console.log(
      `📊 getPayHerePaymentData - Executing booking query for booking: ${bookingId}`
    );
    const bookingResults = await query(bookingQuery, [bookingId]);

    if (bookingResults.length === 0) {
      console.log(`❌ getPayHerePaymentData - Booking not found: ${bookingId}`);
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const booking = bookingResults[0];
    console.log(
      `✅ getPayHerePaymentData - Found booking: ${booking.booking_id}, customer: ${booking.customer_id}, status: ${booking.status}`
    );

    // Note: Removed customer security check to allow users to pay for anyone's bookings
    // This allows customers to pay for bookings made by other users
    console.log(
      `💳 getPayHerePaymentData - Allowing payment for booking by user: ${userId} (${userRole})`
    ); // Check if payment already exists and is successful
    console.log(
      `🔍 getPayHerePaymentData - Checking existing payment for booking: ${bookingId}`
    );
    const existingPayment = await query(
      "SELECT * FROM payments WHERE booking_id = ?",
      [bookingId]
    );

    if (existingPayment.length > 0) {
      console.log(
        `📋 getPayHerePaymentData - Found existing payment with status: ${existingPayment[0].status}`
      );
      if (existingPayment[0].status === "success") {
        console.log(
          `❌ getPayHerePaymentData - Payment already completed for booking: ${bookingId}`
        );
        return res.status(400).json({
          success: false,
          message: "Payment already completed for this booking",
        });
      }
    } else {
      console.log(
        `📋 getPayHerePaymentData - No existing payment found for booking: ${bookingId}`
      );
    }

    // Generate order ID if not exists
    let orderId;
    if (existingPayment.length > 0 && existingPayment[0].payhere_payment_id) {
      orderId = existingPayment[0].payhere_payment_id;
      console.log(
        `🔄 getPayHerePaymentData - Using existing order ID: ${orderId}`
      );
    } else {
      orderId = `PG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log(
        `🆕 getPayHerePaymentData - Generated new order ID: ${orderId}`
      );

      // Update or create payment record with order ID
      if (existingPayment.length > 0) {
        console.log(
          `🔧 getPayHerePaymentData - Updating existing payment with order ID`
        );
        await query(
          "UPDATE payments SET payhere_payment_id = ? WHERE booking_id = ?",
          [orderId, bookingId]
        );
      } else {
        console.log(`➕ getPayHerePaymentData - Creating new payment record`);
        await query(
          `INSERT INTO payments (booking_id, amount, payment_method, payhere_payment_id, status) 
           VALUES (?, ?, ?, ?, 'pending')`,
          [bookingId, booking.total_price, "PayHere", orderId]
        );
      }
    } // Prepare PayHere payment data with only required fields
    console.log(`🔧 getPayHerePaymentData - Preparing PayHere payment data`);

    // Determine if this is for web or mobile platform based on request headers or explicit parameter
    const isWebPayment =
      req.headers["user-agent"]?.includes("Mozilla") ||
      req.query.platform === "web";
    const merchantSecret = isWebPayment
      ? process.env.PAYHERE_WEB_MERCHANT_SECRET
      : process.env.PAYHERE_MOBILE_MERCHANT_SECRET;

    console.log(
      `🌐 getPayHerePaymentData - Platform detected: ${
        isWebPayment ? "Web" : "Mobile"
      }`
    );

    const paymentData = {
      sandbox: process.env.PAYHERE_SANDBOX === "true",
      merchant_id: process.env.PAYHERE_MERCHANT_ID || "1230935",
      notify_url:
        process.env.PAYHERE_NOTIFY_URL ||
        `${req.protocol}://${req.get("host")}/api/payments/payhere/notify`,
      // Web-specific URLs for payment completion handling
      return_url:
        process.env.PAYHERE_RETURN_URL ||
        `${req.protocol}://${req.get("host")}/payment-success`,
      cancel_url:
        process.env.PAYHERE_CANCEL_URL ||
        `${req.protocol}://${req.get("host")}/payment-failed`,
      order_id: orderId,
      items: "seat items", // Generic description
      currency: "LKR",
      amount: booking.total_price.toFixed(2), // Ensure 2 decimal places
      first_name: "Customer", // Generic value - will use checkout form data
      last_name: "Name", // Generic value - will use checkout form data
      email: "customer@example.com", // Generic value - will use checkout form data
      phone: "", // Generic value - will use checkout form data
      country: "Sri Lanka", // Default country
    };

    // Generate hash for web payments or include merchant secret for mobile
    if (isWebPayment) {
      console.log("🔐 getPayHerePaymentData - Generating hash for web payment");
      paymentData.hash = generatePayHereHash(
        paymentData.merchant_id,
        paymentData.order_id,
        paymentData.amount,
        paymentData.currency,
        merchantSecret
      );
      console.log("✅ getPayHerePaymentData - Hash generated for web payment");
    } else {
      // For mobile payments, include merchant secret for SDK
      paymentData.merchant_secret = merchantSecret;
      console.log(
        "📱 getPayHerePaymentData - Merchant secret included for mobile payment"
      );
    }
    console.log(`💰 getPayHerePaymentData - Payment data prepared:`);
    console.log(`  - Sandbox Mode: ${paymentData.sandbox}`);
    console.log(`  - Merchant ID: ${paymentData.merchant_id}`);
    console.log(`  - Return URL: ${paymentData.return_url}`);
    console.log(`  - Cancel URL: ${paymentData.cancel_url}`);
    console.log(`  - Order ID: ${paymentData.order_id}`);
    console.log(`  - Amount: ${paymentData.amount} ${paymentData.currency}`);
    console.log(`  - Customer: Generic (will use checkout form data)`);
    console.log(`  - Email: Generic (will use checkout form data)`);
    console.log(`  - Phone: Generic (will use checkout form data)`);
    console.log(`  - Country: ${paymentData.country}`);
    console.log(
      `📝 getPayHerePaymentData - Logging activity for user: ${userId}`
    );
    await logActivity(
      userId,
      userRole,
      "payment_request",
      `Payment request generated for booking ${bookingId} - ${booking.shop_name} - ${booking.seat_type_name}`,
      bookingId,
      "booking"
    );

    console.log(
      `✅ getPayHerePaymentData - Successfully prepared payment data for booking: ${bookingId}`
    );
    res.json({
      success: true,
      message: "Payment data retrieved successfully",
      data: paymentData,
    });
  } catch (error) {
    console.error(`❌ getPayHerePaymentData - Error occurred:`, error);
    res.status(500).json({
      success: false,
      message: "Error getting payment data",
      error: error.message,
    });
  }
};

/**
 * Handle PayHere payment notification webhook
 */
exports.handlePayHereNotification = async (req, res) => {
  try {
    const notificationData = req.body;
    console.log("🔔 PayHere notification received:", notificationData);
    console.log("📊 PayHere Notification Analysis:");
    console.log(`  - Status Code: ${notificationData.status_code}`);
    console.log(`  - Status Message: ${notificationData.status_message}`);
    console.log(`  - Payment ID: ${notificationData.payment_id}`);
    console.log(`  - Order ID: ${notificationData.order_id}`);
    console.log(
      `  - Amount: ${
        notificationData.captured_amount || notificationData.payhere_amount
      }`
    );
    console.log(`  - Currency: ${notificationData.payhere_currency}`);
    console.log(`  - Payment Method: ${notificationData.method}`);
    console.log(
      `  - Card: ${notificationData.card_no} (${notificationData.card_expiry})`
    );
    console.log(`  - Booking ID: ${notificationData.custom_1}`);
    console.log(`  - Customer ID: ${notificationData.custom_2}`);

    // Interpret status code
    const statusInterpretation = {
      2: "✅ SUCCESS - Payment completed successfully",
      "-1": "🚫 CANCELLED - Payment cancelled by user",
      "-2": "❌ FAILED - Payment failed (limit exceeded, declined, etc.)",
      "-3": "🔄 CHARGEBACK - Payment charged back",
    };
    console.log(
      `📋 Status Interpretation: ${
        statusInterpretation[notificationData.status_code] ||
        "❓ UNKNOWN STATUS"
      }`
    );

    // Store raw notification data first
    const notificationId = await query(
      `INSERT INTO payment_notifications 
       (payhere_payment_id, payhere_order_id, merchant_id, payhere_amount, 
        payhere_currency, status_code, status_message, payment_method, 
        card_holder_name, card_no, card_expiry, custom_1, custom_2, 
        md5sig, raw_notification_data, received_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        notificationData.payment_id || null,
        notificationData.order_id || null,
        notificationData.merchant_id || null,
        notificationData.amount || null,
        notificationData.currency || null,
        notificationData.status_code || null,
        notificationData.status_message || null,
        notificationData.method || null,
        notificationData.card_holder_name || null,
        notificationData.card_no || null,
        notificationData.card_expiry || null,
        notificationData.custom_1 || null,
        notificationData.custom_2 || null,
        notificationData.md5sig || null,
        JSON.stringify(notificationData),
      ]
    );

    // Verify MD5 signature
    const crypto = require("crypto");
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

    let isValidSignature = false;
    if (notificationData.md5sig && merchantSecret) {
      const localMd5sig = crypto
        .createHash("md5")
        .update(
          merchantSecret +
            notificationData.merchant_id +
            notificationData.order_id +
            notificationData.amount +
            notificationData.currency +
            notificationData.status_code +
            crypto
              .createHash("md5")
              .update(merchantSecret)
              .digest("hex")
              .toLowerCase()
        )
        .digest("hex")
        .toLowerCase();

      isValidSignature = localMd5sig === notificationData.md5sig.toLowerCase();
    }

    // Update notification with signature verification
    await query(
      "UPDATE payment_notifications SET md5sig_verified = ? WHERE notification_id = ?",
      [isValidSignature, notificationId.insertId]
    );

    // SEND IMMEDIATE RESPONSE TO PAYHERE - BEFORE PROCESSING
    console.log("📤 Sending immediate response to PayHere...");
    res.status(200).send("OK");
    console.log("✅ Response sent to PayHere successfully");

    // Process the payment asynchronously after sending response
    processPaymentAsynchronously(
      notificationData,
      notificationId.insertId,
      isValidSignature
    );
  } catch (error) {
    console.error("Error handling PayHere notification:", error);
    res.status(500).send("Error");
  }
};

/**
 * Process PayHere payment notification asynchronously after sending response
 */
async function processPaymentAsynchronously(
  notificationData,
  notificationDbId,
  isValidSignature
) {
  try {
    console.log("🔄 Starting asynchronous payment processing...");

    if (isValidSignature || process.env.NODE_ENV === "development") {
      try {
        // Find ALL payment records for this order - FIXED: Use payhere_order_id not payhere_payment_id
        const payments = await query(
          "SELECT * FROM payments WHERE payhere_order_id = ?",
          [notificationData.order_id]
        );

        if (payments.length > 0) {
          let newStatus = "pending";

          // Map PayHere status codes to our status
          switch (parseInt(notificationData.status_code)) {
            case 2: // Success
              newStatus = "success";
              break;
            case -1: // Cancelled
            case -2: // Failed
            case -3: // Chargedback
              newStatus = "failed";
              break;
            default:
              newStatus = "pending";
          }

          console.log(
            `💳 Processing ${payments.length} payments for order: ${notificationData.order_id}`
          );
          console.log(`  - New Status: ${newStatus}`);
          console.log(`  - PayHere Payment ID: ${notificationData.payment_id}`);
          console.log(`  - Payment Method: ${notificationData.method}`);

          // Update ALL payment records for this order - FIXED: Use payhere_order_id in WHERE clause
          await query(
            `UPDATE payments 
             SET status = ?, payhere_payment_id = ?, payment_method = ?, updated_at = NOW()
             WHERE payhere_order_id = ?`,
            [
              newStatus,
              notificationData.payment_id,
              notificationData.method,
              notificationData.order_id,
            ]
          );

          // Update ALL booking statuses for this order
          const bookingIds = payments.map((p) => p.booking_id);
          if (newStatus === "success") {
            await query(
              `UPDATE bookings SET status = 'confirmed' WHERE booking_id IN (${bookingIds
                .map(() => "?")
                .join(",")})`,
              bookingIds
            );
            console.log(
              `✅ Updated ${payments.length} payments and ${bookingIds.length} bookings to confirmed status`
            );

            // Generate enhanced multi-shop tickets for ALL bookings in the order
            try {
              console.log("=".repeat(80));
              console.log(`🎫 STARTING ENHANCED MULTI-SHOP TICKET GENERATION`);
              console.log(`📋 Order ID: ${notificationData.order_id}`);
              console.log(`💳 Payment ID: ${notificationData.payment_id}`);
              console.log(
                `📊 Processing ${payments.length} payments for ${bookingIds.length} bookings`
              );
              console.log("=".repeat(80)); // Get customer information - use checkout customer data from database
              let customerInfo = null;

              // Get checkout customer data from database
              const {
                getCheckoutCustomerByOrderId,
              } = require("./checkoutCustomerController");
              const checkoutCustomer = await getCheckoutCustomerByOrderId(
                notificationData.order_id
              );

              if (checkoutCustomer) {
                console.log(
                  "✅ Using customer info from checkout customer table:",
                  {
                    firstName: checkoutCustomer.first_name,
                    lastName: checkoutCustomer.last_name,
                    email: checkoutCustomer.email,
                    phone: checkoutCustomer.phone,
                    country: checkoutCustomer.country,
                  }
                );

                customerInfo = {
                  firstName: checkoutCustomer.first_name,
                  lastName: checkoutCustomer.last_name,
                  email: checkoutCustomer.email,
                  phone: checkoutCustomer.phone,
                  country: checkoutCustomer.country,
                };

                // Update checkout customer status to success - FIXED: Use payhere_order_id
                await query(
                  "UPDATE checkout_customers SET status = 'success', updated_at = NOW() WHERE payhere_order_id = ?",
                  [notificationData.order_id]
                );
                console.log("✅ Updated checkout customer status to success");
              } else {
                // Fallback to database customer info if checkout customer data not available
                console.log(
                  "⚠️ Checkout customer data not found, falling back to database customer info"
                );
                const [firstBooking] = await query(
                  `SELECT u.user_id, COALESCE(c.first_name, 'Customer') as first_name, 
                          COALESCE(c.last_name, 'Name') as last_name, u.email, u.mobile_number
                   FROM bookings b 
                   JOIN users u ON b.customer_id = u.user_id
                   LEFT JOIN customers c ON u.user_id = c.user_id
                   WHERE b.booking_id = ?`,
                  [payments[0].booking_id]
                );

                if (firstBooking) {
                  customerInfo = {
                    firstName: firstBooking.first_name,
                    lastName: firstBooking.last_name,
                    email: firstBooking.email,
                    phone: firstBooking.mobile_number,
                    country: null, // Database doesn't have country info
                  };
                }
              }
              if (customerInfo) {
                // Get user ID and role for activity logging
                let logUserId = null;
                let logUserRole = "customer"; // Default fallback
                const [bookingForLogging] = await query(
                  `SELECT u.user_id, u.role
                   FROM bookings b 
                   JOIN users u ON b.customer_id = u.user_id
                   WHERE b.booking_id = ?`,
                  [payments[0].booking_id]
                );
                if (bookingForLogging) {
                  logUserId = bookingForLogging.user_id;
                  logUserRole = bookingForLogging.role;
                }

                // Use the new multi-shop ticket service
                const multiShopTicketService = require("../services/multiShopTicketService");

                const ticketResult =
                  await multiShopTicketService.processMultiShopTickets(
                    notificationData.order_id,
                    notificationData.payment_id,
                    customerInfo,
                    notificationData.method // Pass payment method from PayHere notification
                  );

                if (ticketResult.success) {
                  console.log("=".repeat(80));
                  console.log(
                    `✅ ENHANCED MULTI-SHOP TICKETS GENERATED SUCCESSFULLY!`
                  );
                  console.log(`📊 SUMMARY:`, {
                    totalTicketRecords: ticketResult.ticketsCreated,
                    totalShopGroups:
                      ticketResult.groupSummary?.totalGroups ||
                      ticketResult.shopsProcessed,
                    emailSent: ticketResult.emailSent,
                    recipient: ticketResult.recipient,
                  });

                  if (ticketResult.groupSummary) {
                    console.log(`🏪 SHOP-EVENT GROUPS PROCESSED:`);
                    ticketResult.groupSummary.groupDetails.forEach(
                      (group, index) => {
                        console.log(
                          `   ${index + 1}. ${group.shopName} on ${new Date(
                            group.eventDate
                          ).toLocaleDateString()}`
                        );
                        console.log(
                          `      📋 Tickets: ${group.ticketsCount}, PDF: ${
                            group.pdfGenerated ? "✅" : "❌"
                          }`
                        );
                      }
                    );
                  }

                  console.log(
                    `📧 Email Status: ${
                      ticketResult.emailSent
                        ? "Sent successfully"
                        : "Failed/Skipped"
                    }`
                  );
                  if (ticketResult.messageId) {
                    console.log(
                      `📬 Email Message ID: ${ticketResult.messageId}`
                    );
                  }
                  console.log("=".repeat(80));

                  // Log activity for successful enhanced multi-shop ticket generation
                  if (logUserId) {
                    await logActivity(
                      logUserId,
                      logUserRole, // Use actual user role instead of hardcoded "customer"
                      "enhanced_multi_shop_tickets_generated",
                      `Enhanced tickets generated for order ${
                        notificationData.order_id
                      }: ${
                        ticketResult.groupSummary?.totalGroups ||
                        ticketResult.shopsProcessed
                      } shop-event groups, ${
                        ticketResult.ticketsCreated
                      } total tickets. Groups: ${
                        ticketResult.groupSummary?.groupDetails
                          ?.map((g) => `${g.shopName}(${g.ticketsCount})`)
                          .join(", ") || "See tickets for details"
                      }`,
                      null, // Use null since affected_entity_id expects an integer
                      "order"
                    );
                  }
                } else {
                  console.error("=".repeat(80));
                  console.error(
                    `❌ ENHANCED MULTI-SHOP TICKET GENERATION FAILED`
                  );
                  console.error(`📋 Order: ${notificationData.order_id}`);
                  console.error(
                    `❌ Reason: ${ticketResult.error || "Unknown error"}`
                  );
                  console.error("=".repeat(80));
                }
              } else {
                console.error(
                  `❌ Could not find customer information for order ${notificationData.order_id}`
                );
              }
            } catch (multiShopTicketError) {
              console.error("=".repeat(80));
              console.error(`❌ ENHANCED TICKET GENERATION ERROR`);
              console.error(`📋 Order: ${notificationData.order_id}`);
              console.error(`❌ Error: ${multiShopTicketError.message}`);
              console.error(`📊 Stack: ${multiShopTicketError.stack}`);
              console.error("=".repeat(80));
              // Don't fail the payment processing if ticket generation fails
              // The payment is still successful, tickets can be regenerated later
            }

            // Log successful payment for each booking
            for (const payment of payments) {
              try {
                const [bookingDetails] = await query(
                  `SELECT u.user_id, u.role FROM bookings b 
                   JOIN users u ON b.customer_id = u.user_id
                   WHERE b.booking_id = ?`,
                  [payment.booking_id]
                );
              } catch (activityLogError) {
                console.error(
                  `❌ Error logging activity for booking ${payment.booking_id}:`,
                  activityLogError.message
                );
              }
            } // Log overall order success - get user ID from first booking
            try {
              const [firstBookingDetails] = await query(
                `SELECT u.user_id, u.role FROM bookings b 
                 JOIN users u ON b.customer_id = u.user_id
                 WHERE b.booking_id = ?`,
                [payments[0].booking_id]
              );
              if (firstBookingDetails) {
                await logActivity(
                  firstBookingDetails.user_id,
                  firstBookingDetails.role, // Use actual user role
                  "multi_payment_success",
                  `Multi-item payment successful for order ${notificationData.order_id} with ${payments.length} bookings`,
                  null, // Use null since affected_entity_id expects an integer
                  "order"
                );
              }
            } catch (orderLogError) {
              console.error(
                "❌ Error logging order success activity:",
                orderLogError.message
              );
            }
          } else if (newStatus === "failed") {
            console.log(
              `❌ Multi-item Payment Failed - Processing refund and seat restoration for ${payments.length} payments:`
            );
            console.log(`  - Reason: ${notificationData.status_message}`);
            console.log(
              `  - PayHere Status Code: ${notificationData.status_code}`
            );
            console.log(`  - Order ID: ${notificationData.order_id}`);

            // Handle failed payment - restore seat availability and update booking status for ALL bookings
            await query(
              `UPDATE bookings SET status = 'cancelled' WHERE booking_id IN (${bookingIds
                .map(() => "?")
                .join(",")})`,
              bookingIds
            );

            // Restore seat availability for all failed bookings
            for (const payment of payments) {
              try {
                console.log(
                  "🔍 [PaymentController] Getting booking details for restoration, booking_id:",
                  payment.booking_id
                );
                const [booking] = await query(
                  "SELECT seat_type_id, day_id, quantity, customer_id FROM bookings WHERE booking_id = ?",
                  [payment.booking_id]
                );
                console.log(
                  "📊 [PaymentController] Retrieved booking for restoration:",
                  booking
                );

                if (booking) {
                  // Restore seat quantity for failed payment
                  await query(
                    `UPDATE seat_type_availability 
                     SET quantity = quantity + ?
                     WHERE seat_type_id = ? AND day_id = ?`,
                    [booking.quantity, booking.seat_type_id, booking.day_id]
                  );

                  console.log(
                    `🔄 Restored ${booking.quantity} seats for booking ${payment.booking_id}`
                  );
                }
              } catch (restoreError) {
                console.error(
                  `❌ Error restoring seats for booking ${payment.booking_id}:`,
                  restoreError.message
                );
                // Continue processing other bookings even if one fails
              }
            } // Log overall order failure - get user ID from first booking
            try {
              const [firstBookingDetails] = await query(
                `SELECT u.user_id FROM bookings b 
                 JOIN users u ON b.customer_id = u.user_id
                 WHERE b.booking_id = ?`,
                [payments[0].booking_id]
              );

              if (firstBookingDetails) {
                await logActivity(
                  firstBookingDetails.user_id,
                  "customer",
                  "multi_payment_failed",
                  `Multi-item payment failed for order ${notificationData.order_id} with ${payments.length} bookings - all seats restored`,
                  null, // Use null since affected_entity_id expects an integer
                  "order"
                );
              }
            } catch (orderLogError) {
              console.error(
                "❌ Error logging order failure activity:",
                orderLogError.message
              );
            }
          }

          console.log(
            `✅ Successfully processed ${payments.length} payments for order: ${notificationData.order_id}`
          );
        }

        // Mark notification as processed
        await query(
          "UPDATE payment_notifications SET processing_status = 'processed', processed_at = NOW() WHERE notification_id = ?",
          [notificationDbId]
        );
      } catch (processingError) {
        console.error(
          "Error processing payment notification:",
          processingError
        );

        // Mark notification as failed
        await query(
          "UPDATE payment_notifications SET processing_status = 'failed', error_message = ? WHERE notification_id = ?",
          [processingError.message, notificationDbId]
        );
      }
    } else {
      console.error("Invalid MD5 signature in PayHere notification");
      await query(
        "UPDATE payment_notifications SET processing_status = 'failed', error_message = 'Invalid MD5 signature' WHERE notification_id = ?",
        [notificationDbId]
      );
    }

    console.log("🔄 Asynchronous payment processing completed");
  } catch (error) {
    console.error("Error in asynchronous payment processing:", error);

    // Update notification status to failed
    try {
      await query(
        "UPDATE payment_notifications SET processing_status = 'failed', error_message = ? WHERE notification_id = ?",
        [error.message, notificationDbId]
      );
    } catch (dbError) {
      console.error("Error updating notification status:", dbError);
    }
  }
}

/**
 * Get customer payment history with shop-wise grouping by payhere_payment_id
 */
exports.getCustomerPaymentHistory = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // After migration, bookings.customer_id directly references users.user_id
    // So we can use req.user.id directly instead of looking up customer_id
    const userId = req.user.id;

    // Get all valid payments for this customer grouped by payhere_payment_id
    const sql = `
      SELECT p.payment_id, p.booking_id, p.amount, p.payment_method, 
             p.status, p.payhere_payment_id as transaction_reference, 
             p.created_at,
             b.shop_id, b.quantity, b.total_price, b.status as booking_status,
             s.name as shop_name,
             st.name as seat_type_name, st.seat_type_id,
             pd.date as procession_date
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      WHERE b.customer_id = ? 
        AND p.status = 'success' 
        AND p.payhere_payment_id IS NOT NULL 
        AND p.payhere_payment_id != '' 
        AND p.payhere_payment_id != '0'
      ORDER BY p.created_at DESC
    `;

    const payments = await query(sql, [userId]);

    // Group payments by payhere_payment_id
    const groupedPayments = {};

    payments.forEach((payment) => {
      const payhereId = payment.transaction_reference;
      if (!groupedPayments[payhereId]) {
        groupedPayments[payhereId] = [];
      }
      groupedPayments[payhereId].push(payment);
    });

    // Convert to the expected format for the mobile app
    const paymentHistory = [];

    Object.keys(groupedPayments).forEach((payhereId) => {
      const paymentsForReference = groupedPayments[payhereId];

      // Calculate total amount for this payment reference
      const totalAmount = paymentsForReference.reduce(
        (sum, payment) => sum + parseFloat(payment.amount),
        0
      );

      // Get the earliest payment date
      const paymentDate = paymentsForReference.reduce((earliest, payment) => {
        const currentDate = new Date(payment.created_at);
        return currentDate < earliest ? currentDate : earliest;
      }, new Date(paymentsForReference[0].created_at));

      // Group by shop
      const shopGroups = {};
      paymentsForReference.forEach((payment) => {
        const shopId = payment.shop_id.toString();
        if (!shopGroups[shopId]) {
          shopGroups[shopId] = {
            shop_id: shopId,
            shop_name: payment.shop_name,
            seat_details: [],
          };
        }
        shopGroups[shopId].seat_details.push({
          seat_type_id: payment.seat_type_id.toString(),
          seat_type_name: payment.seat_type_name,
          procession_date: formatDateString(payment.procession_date),
          quantity: payment.quantity,
          amount: payment.amount,
        });
      });

      paymentHistory.push({
        payment_id: paymentsForReference[0].payment_id.toString(),
        reference_number: payhereId,
        total_amount: totalAmount,
        payment_date: paymentDate.toISOString(),
        payment_method: paymentsForReference[0].payment_method,
        status: paymentsForReference[0].status,
        shop_groups: Object.values(shopGroups),
      });
    });

    return res.status(200).json({
      success: true,
      payments: paymentHistory,
      message: "Customer payment history retrieved successfully",
    });
  } catch (error) {
    console.error("❌ Error in getCustomerPaymentHistory:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching customer payment history",
      error: error.message,
    });
  }
};

/**
 * Helper function to format date as YYYY-MM-DD string
 */
const formatDateString = (date) => {
  if (!date) return null;

  // If it's already a string in the correct format, return it
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // If it's a Date object, format it properly
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // For other cases, try to create a Date object and format it
  try {
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return null;
  }
};
