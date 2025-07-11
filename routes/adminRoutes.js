const express = require("express");
const router = express.Router();
const { query } = require("../config/database-schema");
const {
  verifyFirebaseToken,
  requireUser,
  requireRole,
  logAdminAction,
} = require("../middleware/firebaseAuth");
const bcrypt = require("bcrypt");

// Admin login
router.post("/login", verifyFirebaseToken, requireUser, (req, res) => {
  res.json({
    success: true,
    message: "Login successful",
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
    },
  });
});

// Get admin profile
router.get("/profile", verifyFirebaseToken, requireUser, async (req, res) => {
  try {
    const profile = await query(
      `SELECT ${req.user.role}ID as id, user_name as username, 
            created_at, last_login FROM ${req.user.table} 
            WHERE ${req.user.role}ID = ?`,
      [req.user.id]
    );

    res.json({
      success: true,
      profile: profile[0],
    });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
});

// Change password
router.post(
  "/change-password",
  verifyFirebaseToken,
  requireUser,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current and new password are required",
        });
      }

      // Get current password hash
      const user = await query(
        `SELECT password FROM ${req.user.table} WHERE ${req.user.role}ID = ?`,
        [req.user.id]
      );

      // Verify current password
      if (!(await bcrypt.compare(currentPassword, user[0].password))) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await query(
        `UPDATE ${req.user.table} SET password = ? WHERE ${req.user.role}ID = ?`,
        [hashedPassword, req.user.id]
      );

      // Log the action
      await logAdminAction(req.user.id, {
        type: "UPDATE",
        table: req.user.table,
        recordId: req.user.id,
        details: "Changed password",
      });

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (err) {
      console.error("Error changing password:", err);
      res.status(500).json({
        success: false,
        message: "Failed to change password",
      });
    }
  }
);

// SuperAdmin-only: Create new admin
router.post(
  "/create",
  verifyFirebaseToken,
  requireUser,
  requireRole("superadmin"),
  async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: "Username and password are required",
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
        });
      }

      // Check if username exists
      const existing = await query("SELECT * FROM Admin WHERE user_name = ?", [
        username,
      ]);

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Username already exists",
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create new admin
      const result = await query(
        "INSERT INTO Admin (user_name, password, created_by) VALUES (?, ?, ?)",
        [username, hashedPassword, req.user.id]
      );

      // Log the action
      await logAdminAction(req.user.id, {
        type: "CREATE",
        table: "Admin",
        recordId: result.insertId,
        details: `Created new admin: ${username}`,
      });

      res.status(201).json({
        success: true,
        message: "Admin created successfully",
        adminId: result.insertId,
      });
    } catch (err) {
      console.error("Error creating admin:", err);
      res.status(500).json({
        success: false,
        message: "Failed to create admin",
      });
    }
  }
);

// SuperAdmin-only: List all admins
router.get(
  "/list",
  verifyFirebaseToken,
  requireUser,
  requireRole("superadmin"),
  async (req, res) => {
    try {
      const admins = await query(`
            SELECT a.adminID, a.user_name, a.created_at, a.last_login, 
                   a.is_active, s.user_name as created_by
            FROM Admin a
            LEFT JOIN SuperAdmin s ON a.created_by = s.superadminID
            ORDER BY a.created_at DESC
        `);

      res.json({
        success: true,
        admins,
      });
    } catch (err) {
      console.error("Error listing admins:", err);
      res.status(500).json({
        success: false,
        message: "Failed to list admins",
      });
    }
  }
);

// SuperAdmin-only: Toggle admin status
router.put(
  "/toggle-status/:id",
  verifyFirebaseToken,
  requireUser,
  requireRole("superadmin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Get current status
      const admin = await query(
        "SELECT is_active FROM Admin WHERE adminID = ?",
        [id]
      );

      if (admin.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Admin not found",
        });
      }

      const newStatus = !admin[0].is_active;

      // Update status
      await query("UPDATE Admin SET is_active = ? WHERE adminID = ?", [
        newStatus,
        id,
      ]);

      // Log the action
      await logAdminAction(req.user.id, {
        type: "UPDATE",
        table: "Admin",
        recordId: id,
        details: `Set active status to ${newStatus}`,
      });

      res.json({
        success: true,
        message: `Admin ${
          newStatus ? "activated" : "deactivated"
        } successfully`,
      });
    } catch (err) {
      console.error("Error toggling admin status:", err);
      res.status(500).json({
        success: false,
        message: "Failed to toggle admin status",
      });
    }
  }
);

module.exports = router;
