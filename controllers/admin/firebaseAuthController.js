
const { query } = require("../../config/database-schema");
const { admin } = require("../../config/firebase");
const { syncUserToDatabase } = require("../../config/firebaseAuthSync");

// exports.registerUser = async (req, res) => {
//   try {
//     const { username, firstName, lastName, mobileNumber, role = 'customer', firebaseUid } = req.body;

//     // Validate input
//     if (!username || !firstName || !lastName || !firebaseUid) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields"
//       });
//     }

//     // Check if user already exists
//     const existingUser = await query(
//       "SELECT user_id FROM users WHERE firebase_uid = ? OR username = ?",
//       [firebaseUid, username]
//     );

//     if (existingUser.length > 0) {
//       return res.status(409).json({
//         success: false,
//         message: "User already exists"
//       });
//     }

//     // Get email from Firebase user
//     const firebaseUser = await admin.auth().getUser(firebaseUid);
//     const email = firebaseUser.email;

//     // Insert into users table
//     const result = await query(
//       "INSERT INTO users (firebase_uid, username, email, role, mobile_number) VALUES (?, ?, ?, ?, ?)",
//       [firebaseUid, username, email, role, mobileNumber || null]
//     );

//     const userId = result.insertId;

//     // Insert into appropriate role table
//     if (role === 'customer') {
//       await query(
//         "INSERT INTO customers (user_id, first_name, last_name) VALUES (?, ?, ?)",
//         [userId, firstName, lastName]
//       );
//     } else if (role === 'seller') {
//       await query(
//         "INSERT INTO sellers (user_id, first_name, last_name) VALUES (?, ?, ?)",
//         [userId, firstName, lastName]
//       );
//     } else if (role === 'admin' || role === 'super_admin') {
//       await query(
//         "INSERT INTO admins (user_id) VALUES (?)",
//         [userId]
//       );
//     }

//     // Return success
//     return res.status(201).json({
//       success: true,
//       message: "User registered successfully"
//     });

//   } catch (error) {
//     console.error("Error registering user:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error registering user",
//       error: error.message
//     });
//   }
// };
// In firebaseAuthController.js - update the registerUser function
exports.registerUser = async (req, res) => {
  try {
    const { username, firstName, lastName, mobileNumber, role = 'customer', firebaseUid, email } = req.body;

    // Validate input
    if (!username || !firstName || !lastName || !firebaseUid || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Check if user already exists
    const existingUser = await query(
      "SELECT user_id FROM users WHERE firebase_uid = ? OR username = ? OR email = ?",
      [firebaseUid, username, email]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "User already exists"
      });
    }

    // Insert into users table
    const result = await query(
      "INSERT INTO users (firebase_uid, username, email, role, mobile_number) VALUES (?, ?, ?, ?, ?)",
      [firebaseUid, username, email, role, mobileNumber || null]
    );

    const userId = result.insertId;

    // Insert into appropriate role table
    if (role === 'customer') {
      await query(
        "INSERT INTO customers (user_id, first_name, last_name) VALUES (?, ?, ?)",
        [userId, firstName, lastName]
      );
    } else if (role === 'seller') {
      await query(
        "INSERT INTO sellers (user_id, first_name, last_name) VALUES (?, ?, ?)",
        [userId, firstName, lastName]
      );
    } else if (role === 'admin' || role === 'super_admin') {
      await query(
        "INSERT INTO admins (user_id) VALUES (?)",
        [userId]
      );
    }

    // Get the Firebase user
    const firebaseUser = await admin.auth().getUser(firebaseUid);
    
    // Send verification email if the user has an email and it's not verified
    if (email && !firebaseUser.emailVerified) {
      try {
        await sendVerificationEmail(firebaseUser);
        console.log(`Verification email sent to ${email}`);
      } catch (emailError) {
        console.error("Error sending verification email:", emailError);
        // Don't fail the registration if email fails
      }
    }

    return res.status(201).json({
      success: true,
      message: "User registered successfully"
    });

  } catch (error) {
    console.error("Error registering user:", error);
    return res.status(500).json({
      success: false,
      message: "Error registering user",
      error: error.message
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


exports.syncUser = async (req, res) => {
  try {
    if (!req.firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "Firebase UID is required"
      });
    }

    const firebaseUser = await admin.auth().getUser(req.firebaseUid);
    const userId = await syncUserToDatabase(firebaseUser);

    return res.status(200).json({
      success: true,
      message: "User synced successfully",
      userId
    });
  } catch (error) {
    console.error("Error syncing user:", error);
    return res.status(500).json({
      success: false,
      message: "Error syncing user",
      error: error.message
    });
  }};







 
  


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
// In your middleware/firebaseAuth.js
const requireRole = (roles) => async (req, res, next) => {
  try {
    const response = await API.get('/users/verify-admin');
    
    if (roles.includes(response.data.role)) {
      req.user.role = response.data.role;
      return next();
    }
    
    return res.status(403).json({ message: "Insufficient permissions" });
  } catch (error) {
    console.error("Role verification error:", error);
    return res.status(500).json({ message: "Error verifying permissions" });
  }
};