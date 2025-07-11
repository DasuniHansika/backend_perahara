const admin = require("../config/firebase");
const pool = require("../config/database");
const { handleFirebaseError } = require("../utils/errorHandlers");

class AuthService {
  async verifyToken(token) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      return decodedToken;
    } catch (error) {
      handleFirebaseError(error);
    }
  }

  async getUserByFirebaseUid(uid) {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM users WHERE firebase_uid = ?",
        [uid]
      );
      return rows[0] || null;
    } catch (error) {
      throw new Error("Database error: " + error.message);
    }
  }
}

module.exports = new AuthService();