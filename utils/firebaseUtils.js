// utils/firebaseUtils.js
const { admin } = require("../config/firebase");

/**
 * Create a custom token for a user
 * @param {string} uid - Firebase UID
 * @param {Object} claims - Custom claims to add to the token
 * @returns {Promise<string>} - Custom token
 */
const createCustomToken = async (uid, claims = {}) => {
  try {
    return await admin.auth().createCustomToken(uid, claims);
  } catch (error) {
    console.error("Error creating custom token:", error);
    throw error;
  }
};

/**
 * Get user by email from Firebase Auth
 * @param {string} email - User email
 * @returns {Promise<Object>} - Firebase user object
 */
const getUserByEmail = async (email) => {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return null;
    }
    throw error;
  }
};

/**
 * Create a new user in Firebase Auth
 * @param {Object} userData - User data
 * @returns {Promise<Object>} - Created user object
 */
const createFirebaseUser = async (userData) => {
  try {
    return await admin.auth().createUser({
      email: userData.email,
      password: userData.password,
      displayName: userData.displayName || null,
      phoneNumber: userData.phoneNumber || null,
      disabled: false,
    });
  } catch (error) {
    console.error("Error creating Firebase user:", error);
    throw error;
  }
};

/**
 * Set custom user claims
 * @param {string} uid - Firebase UID
 * @param {Object} claims - Claims object
 * @returns {Promise<void>}
 */
const setCustomClaims = async (uid, claims) => {
  try {
    await admin.auth().setCustomUserClaims(uid, claims);
  } catch (error) {
    console.error("Error setting custom claims:", error);
    throw error;
  }
};

/**
 * Revoke refresh tokens for a user
 * @param {string} uid - Firebase UID
 * @returns {Promise<void>}
 */
const revokeRefreshTokens = async (uid) => {
  try {
    await admin.auth().revokeRefreshTokens(uid);
  } catch (error) {
    console.error("Error revoking refresh tokens:", error);
    throw error;
  }
};

/**
 * Verify an ID token and decode it
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<Object>} - Decoded token
 */
const verifyIdToken = async (idToken) => {
  try {
    return await admin.auth().verifyIdToken(idToken, true);
  } catch (error) {
    console.error("Error verifying ID token:", error);
    throw error;
  }
};

module.exports = {
  createCustomToken,
  getUserByEmail,
  createFirebaseUser,
  setCustomClaims,
  revokeRefreshTokens,
  verifyIdToken,
};
