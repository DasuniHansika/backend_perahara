// controllers/firebaseAuthController.js
const { query } = require("../config/database-schema");
const { admin } = require("../config/firebase");

/**
 * Register a new user in our system after Firebase authentication
 */
exports.registerUser = async (req, res) => {
  try {
    // Verify that the request includes a Firebase token
    if (!req.firebaseUid) {
      return res.status(401).json({
        success: false,
        message: "Firebase authentication required",
      });
    }

    const { username, firstName, lastName, mobileNumber } = req.body;

    if (!username || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "Username, first name, and last name are required",
      });
    } // Check if Firebase Admin is properly initialized
    if (!admin.apps.length) {
      console.error("Firebase Admin SDK is not initialized");
      return res.status(500).json({
        success: false,
        message: "Authentication service is not available at this time",
      });
    } // Get Firebase user details
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUser(req.firebaseUid);
    } catch (firebaseError) {
      console.error("Firebase getUser error:", firebaseError);
      return res.status(500).json({
        success: false,
        message:
          "Could not retrieve user information from authentication provider",
      });
    }

    // Check if email is verified
    if (!firebaseUser.emailVerified) {
      return res.status(403).json({
        success: false,
        message:
          "Email verification required. Please verify your email before registering.",
      });
    }

    const email = firebaseUser.email;

    // Check if user already exists in our database
    const existingUser = await query(
      "SELECT user_id FROM users WHERE firebase_uid = ? OR username = ?",
      [req.firebaseUid, username]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    // Insert the new user - default role is 'customer'
    await query(
      "INSERT INTO users (firebase_uid, username, email, role, mobile_number) VALUES (?, ?, ?, ?, ?)",
      [req.firebaseUid, username, email, "customer", mobileNumber || null]
    );

    // Get the inserted user ID
    const [newUser] = await query(
      "SELECT user_id FROM users WHERE firebase_uid = ?",
      [req.firebaseUid]
    ); // Insert into customers table
    await query(
      "INSERT INTO customers (user_id, first_name, last_name) VALUES (?, ?, ?)",
      [newUser.user_id, firstName, lastName]
    ); // Get full user details
    const [userDetails] = await query(
      `SELECT u.user_id, u.username, u.email, u.role, u.mobile_number,
              c.first_name, c.last_name, NULL as profile_picture
       FROM users u
       JOIN customers c ON u.user_id = c.user_id
       WHERE u.firebase_uid = ?`,
      [req.firebaseUid]
    );

    // Log activity for user registration
    try {
      await query(
        `INSERT INTO activity_logs 
         (user_id, role, action_type, description, affected_entity_id, entity_type) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userDetails.user_id,
          userDetails.role,
          "user_registration",
          `User ${username} completed registration with email ${email}`,
          userDetails.user_id,
          "user",
        ]
      );
    } catch (activityLogError) {
      console.error(
        "Error logging user registration activity:",
        activityLogError
      );
      // Don't fail registration if activity logging fails
    }

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: userDetails,
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      success: false,
      message: "Error registering user",
      error: error.message,
    });
  }
};

/**
 * Link an existing user account with a Firebase user
 */
exports.linkFirebaseAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    const { firebaseUid } = req.body;

    if (!firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "Firebase UID is required",
      });
    }

    // Update user with Firebase UID
    const result = await query(
      "UPDATE users SET firebase_uid = ? WHERE user_id = ?",
      [firebaseUid, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Firebase account linked successfully",
    });
  } catch (error) {
    console.error("Error linking Firebase account:", error);
    res.status(500).json({
      success: false,
      message: "Error linking Firebase account",
      error: error.message,
    });
  }
};
