const { query } = require("../config/database-schema");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Admin/SuperAdmin login
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // Check in SuperAdmin table first
    let user = await query("SELECT * FROM SuperAdmin WHERE user_name = ?", [
      username,
    ]);
    let role = "superadmin";
    let table = "SuperAdmin";

    // If not SuperAdmin, check Admin table
    if (user.length === 0) {
      user = await query(
        "SELECT * FROM Admin WHERE user_name = ? AND is_active = TRUE",
        [username]
      );
      role = "admin";
      table = "Admin";
    }

    // If no user found
    if (user.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user[0].password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { id: user[0][`${role}ID`], role },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: process.env.JWT_EXPIRES_IN || "90d" }
    );

    // Update last login
    await query(
      `UPDATE ${table} SET last_login = CURRENT_TIMESTAMP WHERE ${role}ID = ?`,
      [user[0][`${role}ID`]]
    );

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user[0][`${role}ID`],
        username: user[0].user_name,
        role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Logout
exports.logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

// Forgot password (placeholder)
exports.forgotPassword = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Password reset link sent (placeholder)",
  });
};

// Reset password (placeholder)
exports.resetPassword = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Password reset successful (placeholder)",
  });
};
