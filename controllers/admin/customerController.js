// controllers/customerController.js
const { query } = require("../../config/database-schema");

/**
 * Get customer profile by customer ID
 */
exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const customerProfile = await query(
      `
      SELECT c.customer_id, u.username, u.email, u.mobile_number,
             c.first_name, c.last_name, c.profile_picture,
             u.created_at
      FROM customers c
      JOIN users u ON c.user_id = u.user_id
      WHERE c.customer_id = ?
      `,
      [id]
    );

    if (customerProfile.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      customer: customerProfile[0],
    });
  } catch (error) {
    console.error("Error fetching customer profile:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customer profile",
      error: error.message,
    });
  }
};

/**
 * Get all customers
 */
exports.getAllCustomers = async (req, res) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT c.customer_id, u.username, u.email, u.mobile_number,
             c.first_name, c.last_name, c.profile_picture,
             u.created_at
      FROM customers c
      JOIN users u ON c.user_id = u.user_id
    `;

    const params = [];

    if (search) {
      sql += `
        WHERE u.username LIKE ? 
        OR u.email LIKE ? 
        OR c.first_name LIKE ? 
        OR c.last_name LIKE ?
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

    const customers = await query(sql, params);

    return res.status(200).json({
      success: true,
      count: customers.length,
      customers,
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customers",
      error: error.message,
    });
  }
};

/**
 * Get customer's booking history
 */
exports.getCustomerBookings = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const bookings = await query(
      `
      SELECT b.booking_id, b.shop_id, b.seat_type_id, b.day_id, b.quantity, 
             b.total_price, b.status, b.created_at,
             s.name as shop_name, st.name as seat_type_name,
             pd.date as procession_date,
             p.payment_id, p.amount as payment_amount, p.status as payment_status, 
             p.payment_method, p.created_at as payment_time
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      WHERE b.customer_id = ?
      ORDER BY b.created_at DESC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Error fetching customer bookings:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customer bookings",
      error: error.message,
    });
  }
};

/**
 * Get customer's cart items
 */
exports.getCustomerCart = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const cartItems = await query(
      `
      SELECT ci.cart_item_id, ci.shop_id, ci.seat_type_id, ci.day_id, 
             ci.quantity, ci.price_per_seat, ci.total_price, ci.created_at,
             s.name as shop_name, st.name as seat_type_name,
             pd.date as procession_date
      FROM cart_items ci
      JOIN shops s ON ci.shop_id = s.shop_id
      JOIN seat_types st ON ci.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON ci.day_id = pd.day_id
      WHERE ci.customer_id = ? AND (ci.expires_at IS NULL OR ci.expires_at > NOW())
      ORDER BY ci.created_at DESC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      count: cartItems.length,
      cartItems,
    });
  } catch (error) {
    console.error("Error fetching customer cart:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customer cart",
      error: error.message,
    });
  }
};



//mobile
exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const customerProfile = await query(
      `
      SELECT c.customer_id, u.username, u.email, u.mobile_number,
             c.first_name, c.last_name, c.profile_picture,
             u.created_at
      FROM customers c
      JOIN users u ON c.user_id = u.user_id
      WHERE c.customer_id = ?
      `,
      [id]
    );

    if (customerProfile.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      customer: customerProfile[0],
    });
  } catch (error) {
    console.error("Error fetching customer profile:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customer profile",
      error: error.message,
    });
  }
};

/**
 * Get all customers
 */
exports.getAllCustomers = async (req, res) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT c.customer_id, u.username, u.email, u.mobile_number,
             c.first_name, c.last_name, c.profile_picture,
             u.created_at
      FROM customers c
      JOIN users u ON c.user_id = u.user_id
    `;

    const params = [];

    if (search) {
      sql += `
        WHERE u.username LIKE ? 
        OR u.email LIKE ? 
        OR c.first_name LIKE ? 
        OR c.last_name LIKE ?
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

    const customers = await query(sql, params);

    return res.status(200).json({
      success: true,
      count: customers.length,
      customers,
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customers",
      error: error.message,
    });
  }
};

/**
 * Get customer's booking history
 */
exports.getCustomerBookings = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const bookings = await query(
      `
      SELECT b.booking_id, b.shop_id, b.seat_type_id, b.day_id, b.quantity, 
             b.total_price, b.status, b.created_at,
             s.name as shop_name, st.name as seat_type_name,
             pd.date as procession_date,
             p.payment_id, p.amount as payment_amount, p.status as payment_status, 
             p.payment_method, p.created_at as payment_time
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      WHERE b.customer_id = ?
      ORDER BY b.created_at DESC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Error fetching customer bookings:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customer bookings",
      error: error.message,
    });
  }
};

/**
 * Get customer's cart items
 */
exports.getCustomerCart = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const cartItems = await query(
      `
      SELECT ci.cart_item_id, ci.shop_id, ci.seat_type_id, ci.day_id, 
             ci.quantity, ci.price_per_seat, ci.total_price, ci.created_at,
             s.name as shop_name, st.name as seat_type_name,
             pd.date as procession_date
      FROM cart_items ci
      JOIN shops s ON ci.shop_id = s.shop_id
      JOIN seat_types st ON ci.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON ci.day_id = pd.day_id
      WHERE ci.customer_id = ? AND (ci.expires_at IS NULL OR ci.expires_at > NOW())
      ORDER BY ci.created_at DESC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      count: cartItems.length,
      cartItems,
    });
  } catch (error) {
    console.error("Error fetching customer cart:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customer cart",
      error: error.message,
    });
  }
};




// Add these new methods to your customerController.js

/**
 * Create a new customer
 */
exports.createCustomer = async (req, res) => {
  try {
    const { 
      username, 
      email, 
      first_name, 
      last_name, 
      mobile_number, 
      firebaseUid,
      role = 'customer' 
    } = req.body;

    // Validate required fields
    if (!username || !email || !first_name || !last_name || !firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Check if user already exists
    const existingUser = await query(
      "SELECT user_id FROM users WHERE email = ? OR username = ?",
      [email, username]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "User with this email or username already exists"
      });
    }

    // Start transaction
    await query("START TRANSACTION");

    // Create user record
    const userResult = await query(
      `INSERT INTO users 
       (username, email, mobile_number, firebase_uid, role, created_at) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [username, email, mobile_number, firebaseUid, role]
    );

    const userId = userResult.insertId;

    // Create customer record
    await query(
      `INSERT INTO customers 
       (user_id, first_name, last_name, profile_picture, created_at) 
       VALUES (?, ?, ?, ?, NOW())`,
      [userId, first_name, last_name, req.file?.path || null]
    );

    // Commit transaction
    await query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Customer created successfully"
    });

  } catch (error) {
    // Rollback on error
    await query("ROLLBACK");
    console.error("Error creating customer:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating customer",
      error: error.message
    });
  }
};

/**
 * Update customer profile
 */
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      username, 
      email, 
      first_name, 
      last_name, 
      mobile_number 
    } = req.body;

    // Validate required fields
    if (!username || !email || !first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Get customer to update
    const customer = await query(
      "SELECT user_id FROM customers WHERE customer_id = ?",
      [id]
    );

    if (customer.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    const userId = customer[0].user_id;

    // Start transaction
    await query("START TRANSACTION");

    // Update user record
    await query(
      `UPDATE users SET 
       username = ?, email = ?, mobile_number = ?, updated_at = NOW()
       WHERE user_id = ?`,
      [username, email, mobile_number, userId]
    );

    // Update customer record
    await query(
      `UPDATE customers SET 
       first_name = ?, last_name = ?, profile_picture = ?, updated_at = NOW()
       WHERE customer_id = ?`,
      [
        first_name, 
        last_name, 
        req.file?.path || null,
        id
      ]
    );

    // Commit transaction
    await query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Customer updated successfully"
    });

  } catch (error) {
    // Rollback on error
    await query("ROLLBACK");
    console.error("Error updating customer:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating customer",
      error: error.message
    });
  }
};

// Add this to handle file uploads
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/customers/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });
exports.upload = upload.single('profile_picture');
