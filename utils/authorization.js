// Authorization utility functions
// Centralized authorization logic for role-based access control

/**
 * Authorization helper class
 */
class Authorization {
  /**
   * Check if user has permission to view a specific table/resource
   * @param {Object} user - User object with role property
   * @param {string} resource - Resource/table name
   * @returns {boolean} - True if user has view permission
   */
  static canView(user, resource) {
    if (!user || !user.role) return false;

    const role = user.role;

    switch (role) {
      case "super_admin":
        // Super admins can view everything
        return true;

      case "admin":
        // Admins can view everything except super_admin table
        return resource !== "super_admin";

      case "seller":
      case "customer":
        // Customers and sellers can view everything except admin and super_admin tables
        return !["admin", "super_admin"].includes(resource);

      default:
        return false;
    }
  }

  /**
   * Check if user has permission to update a specific table/resource
   * @param {Object} user - User object with role property
   * @param {string} resource - Resource/table name
   * @param {string} operation - Specific operation (optional)
   * @returns {boolean} - True if user has update permission
   */
  static canUpdate(user, resource, operation = null) {
    if (!user || !user.role) return false;

    const role = user.role;

    switch (role) {
      case "super_admin":
        // Super admins can update everything
        return true;

      case "admin":
        // Admins can update everything except super_admin table
        return resource !== "super_admin";

      case "seller":
        // Sellers can update:
        // - users, customers, sellers tables
        // - shops table (only last two images: image3, image4)
        // - seat-related tables
        if (
          [
            "users",
            "customers",
            "sellers",
            "seat_types",
            "seat_type_availability",
          ].includes(resource)
        ) {
          return true;
        }
        if (resource === "shops") {
          // Only allow updating image3 and image4 for sellers
          return (
            operation === "update_images" || operation === "update_last_images"
          );
        }
        return false;

      case "customer":
        // Customers can update: users, customers, sellers tables
        return ["users", "customers", "sellers"].includes(resource);

      default:
        return false;
    }
  }

  /**
   * Check if user can create records in a specific table
   * @param {Object} user - User object with role property
   * @param {string} resource - Resource/table name
   * @returns {boolean} - True if user has create permission
   */
  static canCreate(user, resource) {
    if (!user || !user.role) return false;

    const role = user.role;

    switch (role) {
      case "super_admin":
        return true;

      case "admin":
        return resource !== "super_admin";

      case "seller":
        // Sellers can create shops, seat types, and their own records
        return [
          "shops",
          "seat_types",
          "seat_type_availability",
          "users",
          "customers",
          "sellers",
        ].includes(resource);
      case "customer":
        // Customers can create their own records and bookings
        return [
          "users",
          "customers",
          "bookings",
          "cart_items",
          "payments",
        ].includes(resource);

      default:
        return false;
    }
  }

  /**
   * Check if user can delete records from a specific table
   * @param {Object} user - User object with role property
   * @param {string} resource - Resource/table name
   * @returns {boolean} - True if user has delete permission
   */
  static canDelete(user, resource) {
    if (!user || !user.role) return false;

    const role = user.role;

    switch (role) {
      case "super_admin":
        return true;

      case "admin":
        return resource !== "super_admin";

      case "seller":
        // Sellers can delete their own shops and seat types
        return ["shops", "seat_types", "seat_type_availability"].includes(
          resource
        );

      case "customer":
        // Customers can delete their own cart items and bookings
        return ["cart_items", "bookings"].includes(resource);

      default:
        return false;
    }
  }

  /**
   * Check if user owns a specific record (for self-management)
   * @param {Object} user - User object
   * @param {Object} record - Record to check ownership
   * @param {string} ownershipField - Field that indicates ownership (default: 'user_id')
   * @returns {boolean} - True if user owns the record
   */
  static ownsRecord(user, record, ownershipField = "user_id") {
    if (!user || !record) return false;
    return record[ownershipField] === user.user_id;
  }
  /**
   * Check if seller owns a specific shop
   * @param {Object} user - User object
   * @param {Object} shop - Shop record
   * @returns {boolean} - True if seller owns the shop
   */
  static ownsShop(user, shop) {
    if (!user || !shop || user.role !== "seller") return false;
    return shop.seller_id === user.seller_id;
  }

  /**
   * Check if user can view a specific customer record
   * @param {Object} user - User object
   * @param {number} customerId - Customer ID to check access for
   * @returns {boolean} - True if user can view the customer record
   */
  static async canViewCustomerRecord(user, customerId) {
    if (!user) return false;

    // Admins and super_admins can view any customer record
    if (user.role === "admin" || user.role === "super_admin") {
      return true;
    }

    // For customers, check if they are requesting their own record
    if (user.role === "customer") {
      const { query } = require("../config/database-schema");
      try {
        const customers = await query(
          "SELECT c.customer_id FROM customers c WHERE c.user_id = ?",
          [user.user_id]
        );
        return customers.length > 0 && customers[0].customer_id === customerId;
      } catch (error) {
        console.error("Error checking customer ownership:", error);
        return false;
      }
    }

    return false;
  }

  /**
   * Middleware function to check authorization
   * @param {string} resource - Resource name
   * @param {string} action - Action type (view, create, update, delete)
   * @param {string} operation - Specific operation (optional)
   * @returns {Function} - Express middleware function
   */
  static requirePermission(resource, action, operation = null) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      let hasPermission = false;

      switch (action) {
        case "view":
          hasPermission = Authorization.canView(req.user, resource);
          break;
        case "create":
          hasPermission = Authorization.canCreate(req.user, resource);
          break;
        case "update":
          hasPermission = Authorization.canUpdate(
            req.user,
            resource,
            operation
          );
          break;
        case "delete":
          hasPermission = Authorization.canDelete(req.user, resource);
          break;
        default:
          hasPermission = false;
      }

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `Insufficient permissions to ${action} ${resource}`,
        });
      }

      next();
    };
  }
}

module.exports = Authorization;
