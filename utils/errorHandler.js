// utils/errorHandler.js
/**
 * Handle Firebase authentication errors
 * @param {Error} error - Firebase error object
 * @returns {Object} - Standardized error response
 */
const handleFirebaseAuthError = (error) => {
  // Default error response
  const errorResponse = {
    status: 500,
    success: false,
    message: "An error occurred with authentication",
    error: error.message,
  };

  // Map Firebase error codes to appropriate HTTP status codes and messages
  switch (error.code) {
    case "auth/id-token-expired":
      errorResponse.status = 401;
      errorResponse.message = "Authentication token expired";
      break;

    case "auth/id-token-revoked":
      errorResponse.status = 401;
      errorResponse.message = "Authentication token has been revoked";
      break;

    case "auth/invalid-id-token":
      errorResponse.status = 401;
      errorResponse.message = "Invalid authentication token";
      break;

    case "auth/user-disabled":
      errorResponse.status = 403;
      errorResponse.message = "User account has been disabled";
      break;

    case "auth/user-not-found":
      errorResponse.status = 404;
      errorResponse.message = "User not found";
      break;

    case "auth/email-already-exists":
      errorResponse.status = 409;
      errorResponse.message = "Email already in use";
      break;

    case "auth/invalid-email":
      errorResponse.status = 400;
      errorResponse.message = "Invalid email format";
      break;

    case "auth/phone-number-already-exists":
      errorResponse.status = 409;
      errorResponse.message = "Phone number already in use";
      break;

    case "auth/invalid-phone-number":
      errorResponse.status = 400;
      errorResponse.message = "Invalid phone number format";
      break;

    case "auth/insufficient-permission":
      errorResponse.status = 403;
      errorResponse.message = "Insufficient permissions";
      break;

    case "auth/argument-error":
    case "auth/invalid-argument":
      errorResponse.status = 400;
      errorResponse.message = "Invalid request parameters";
      break;

    default:
      // Keep default status code and message for unknown errors
      console.error("Unhandled Firebase auth error:", error);
  }

  return errorResponse;
};

/**
 * Handle database errors
 * @param {Error} error - Database error object
 * @returns {Object} - Standardized error response
 */
const handleDatabaseError = (error) => {
  const errorResponse = {
    status: 500,
    success: false,
    message: "Database operation failed",
    error: error.message,
  };

  // MySQL error codes
  switch (error.errno) {
    case 1062: // Duplicate entry
      errorResponse.status = 409;
      errorResponse.message = "Resource already exists";
      break;

    case 1452: // Foreign key constraint fails
      errorResponse.status = 400;
      errorResponse.message = "Invalid reference to a resource";
      break;

    case 1451: // Cannot delete or update a parent row
      errorResponse.status = 400;
      errorResponse.message = "Cannot delete or update due to references";
      break;

    default:
      // Keep default status code and message for unknown errors
      console.error("Unhandled database error:", error);
  }

  return errorResponse;
};

module.exports = {
  handleFirebaseAuthError,
  handleDatabaseError,
};
