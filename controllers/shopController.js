// controllers/shopController.js
const { query } = require("../config/database-schema");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

/**
 * Helper function to generate image URLs
 */
const generateImageUrl = (req, filePath) => {
  if (!filePath) return null;

  // If filePath is already a full URL, return it as-is
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }

  // Check if the filePath contains a full URL within it (for cases like "uploads/shops/https://...")
  const urlMatch = filePath.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Otherwise, generate local server URL
  return `${req.protocol}://${req.get("host")}/${filePath.replace(/\\/g, "/")}`;
};

/**
 * Helper function to format date as YYYY-MM-DD string
 */
const formatDateString = (date) => {
  if (!date) return null;

  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      console.error("Invalid date provided:", date);
      return null;
    }
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return null;
  }
};

/**
 * Get all shops with optional filtering
 */
exports.getAllShops = async (req, res) => {
  try {
    // Extract query parameters for filtering
    const {
      sellerId,
      street,
      day,
      availableOnly = false,
      search,
      limit,
      offset = 0,
    } = req.query;

    // Build query conditionally based on filters
    let sql = `
      SELECT s.shop_id, s.seller_id, s.name, s.street, 
             s.latitude, s.longitude, s.image1, s.image2, 
             s.image3, s.image4, s.description, s.created_at,
             u.username as seller_username,
             CONCAT(sel.first_name, ' ', sel.last_name) as seller_name
      FROM shops s
      JOIN sellers sel ON s.seller_id = sel.seller_id
      JOIN users u ON sel.user_id = u.user_id
    `;

    const queryParams = [];
    const conditions = [];

    // Add filters to query
    if (sellerId) {
      conditions.push("s.seller_id = ?");
      queryParams.push(sellerId);
    }

    if (street) {
      conditions.push("s.street LIKE ?");
      queryParams.push(`%${street}%`);
    }

    if (search) {
      conditions.push(
        "(s.name LIKE ? OR s.description LIKE ? OR s.street LIKE ?)"
      );
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // If day is provided and availableOnly is true, filter by availability
    if (day && availableOnly === "true") {
      sql += `
        JOIN (
          SELECT DISTINCT sta.shop_id
          FROM seat_type_availability sta
          JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
          JOIN procession_days pd ON sta.day_id = pd.day_id
          WHERE pd.date = ? AND sta.available = TRUE AND sta.quantity > 0
        ) avail ON s.shop_id = avail.shop_id
      `;
      queryParams.push(day);
    } else if (day) {
      // Just join to filter by day without checking availability
      sql += `
        JOIN (
          SELECT DISTINCT st.shop_id
          FROM seat_types st
          JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id
          JOIN procession_days pd ON sta.day_id = pd.day_id
          WHERE pd.date = ?
        ) day_filter ON s.shop_id = day_filter.shop_id
      `;
      queryParams.push(day);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY s.name ASC";

    // Add pagination if limit is specified
    if (limit) {
      sql += " LIMIT ? OFFSET ?";
      queryParams.push(parseInt(limit), parseInt(offset));
    }

    const shops = await query(sql, queryParams);

    // Get total count if pagination is used
    let totalCount = shops.length;
    if (limit) {
      // Build count query with the same filters
      let countSql = `
        SELECT COUNT(*) as total FROM shops s
      `;

      if (day && availableOnly === "true") {
        countSql += `
          JOIN (
            SELECT DISTINCT sta.shop_id
            FROM seat_type_availability sta
            JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
            JOIN procession_days pd ON sta.day_id = pd.day_id
            WHERE pd.date = ? AND sta.available = TRUE AND sta.quantity > 0
          ) avail ON s.shop_id = avail.shop_id
        `;
      } else if (day) {
        countSql += `
          JOIN (
            SELECT DISTINCT st.shop_id
            FROM seat_types st
            JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id
            JOIN procession_days pd ON sta.day_id = pd.day_id
            WHERE pd.date = ?
          ) day_filter ON s.shop_id = day_filter.shop_id
        `;
      }

      if (conditions.length > 0) {
        countSql += " WHERE " + conditions.join(" AND ");
      }

      const countParams = [...queryParams];
      if (limit) {
        // Remove limit and offset params for count query
        countParams.pop();
        countParams.pop();
      }

      const countResult = await query(countSql, countParams);
      totalCount = countResult[0].total;
    }

    // Process image URLs in the response
    const shopsWithUrls = shops.map((shop) => ({
      ...shop,
      image1: shop.image1
        ? generateImageUrl(req, `uploads/shops/${shop.image1}`)
        : null,
      image2: shop.image2
        ? generateImageUrl(req, `uploads/shops/${shop.image2}`)
        : null,
      image3: shop.image3
        ? generateImageUrl(req, `uploads/shops/${shop.image3}`)
        : null,
      image4: shop.image4
        ? generateImageUrl(req, `uploads/shops/${shop.image4}`)
        : null,
    }));

    return res.status(200).json({
      success: true,
      count: shops.length,
      total: totalCount,
      shops: shopsWithUrls,
    });
  } catch (error) {
    console.error("Error fetching shops:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching shops",
      error: error.message,
    });
  }
};

/**
 * Get shop by ID with seat types and availability
 */
exports.getShopById = async (req, res) => {
  try {
    const { id } = req.params;
    const { day } = req.query;

    // Get shop details
    const shopResults = await query(
      `
      SELECT s.shop_id, s.seller_id, s.name, s.street, 
             s.latitude, s.longitude, s.image1, s.image2, 
             s.image3, s.image4, s.description, s.created_at,
             u.username as seller_username,
             sel.first_name as seller_first_name,
             sel.last_name as seller_last_name,
             sel.profile_picture as seller_profile_picture
      FROM shops s
      JOIN sellers sel ON s.seller_id = sel.seller_id
      JOIN users u ON sel.user_id = u.user_id
      WHERE s.shop_id = ?
      `,
      [id]
    );

    if (shopResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    const shop = shopResults[0];

    // Process image URLs
    shop.image1 = shop.image1
      ? generateImageUrl(req, `uploads/shops/${shop.image1}`)
      : null;
    shop.image2 = shop.image2
      ? generateImageUrl(req, `uploads/shops/${shop.image2}`)
      : null;
    shop.image3 = shop.image3
      ? generateImageUrl(req, `uploads/shops/${shop.image3}`)
      : null;
    shop.image4 = shop.image4
      ? generateImageUrl(req, `uploads/shops/${shop.image4}`)
      : null;
    shop.seller_profile_picture = shop.seller_profile_picture
      ? generateImageUrl(req, `uploads/profiles/${shop.seller_profile_picture}`)
      : null;

    // Get seat types for this shop
    let seatTypeQuery = `
      SELECT st.seat_type_id, st.name, st.image_url, st.description
      FROM seat_types st
      WHERE st.shop_id = ?
    `;

    const seatTypes = await query(seatTypeQuery, [id]);

    // Process seat type image URLs
    for (const seatType of seatTypes) {
      seatType.image_url = seatType.image_url
        ? generateImageUrl(req, `uploads/seat_types/${seatType.image_url}`)
        : null;

      // If day parameter is provided, get availability for that day
      if (day) {
        const availabilityResults = await query(
          `
          SELECT sta.price, sta.quantity, sta.available
          FROM seat_type_availability sta
          JOIN procession_days pd ON sta.day_id = pd.day_id
          WHERE sta.seat_type_id = ? AND pd.date = ?
          `,
          [seatType.seat_type_id, day]
        );

        if (availabilityResults.length > 0) {
          seatType.availability = availabilityResults[0];
        } else {
          seatType.availability = {
            price: 0,
            quantity: 0,
            available: false,
          };
        }
      }
    } // Get booking metrics for this shop
    const bookingsResult = await query(
      `
      SELECT 
        COUNT(*) as total_bookings,
        SUM(CASE WHEN status = 'confirmed' THEN quantity ELSE 0 END) as confirmed_bookings,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
        SUM(CASE WHEN status = 'confirmed' THEN total_price ELSE 0 END) as total_revenue
      FROM bookings 
      WHERE shop_id = ?
      `,
      [id]
    );

    // Get total seats from seat type availability
    const seatTypesResult = await query(
      `SELECT COALESCE(SUM(sta.quantity), 0) as total_seats 
       FROM seat_types st 
       LEFT JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id 
       WHERE st.shop_id = ?`,
      [id]
    ); // Add metrics to shop object
    shop.total_seats = seatTypesResult[0].total_seats || 0;
    shop.confirmed_bookings = bookingsResult[0].confirmed_bookings || 0;
    shop.pending_bookings = bookingsResult[0].pending_bookings || 0;
    shop.total_revenue = parseFloat(bookingsResult[0].total_revenue) || 0;

    // Calculate available seats: total seats minus confirmed bookings
    shop.available_seats = Math.max(
      0,
      (shop.total_seats || 0) - (shop.confirmed_bookings || 0)
    );

    // Process seat types to match expected format
    const processedSeatTypes = seatTypes.map((seatType) => ({
      id: seatType.seat_type_id.toString(),
      name: seatType.name,
      description: seatType.description,
      imageUrl: seatType.image_url,
      availableSeats: seatType.availability?.quantity || 0,
      pricePerSeat: seatType.availability?.price || 0,
      availableEventDates: [], // Will be populated if needed
    }));

    // Add seat types to shop object
    shop.seatTypes = processedSeatTypes; // Get procession days available for this shop (based on any seat type availability)
    const processionDays = await query(
      `
      SELECT DISTINCT pd.day_id, pd.date
      FROM procession_days pd
      JOIN seat_type_availability sta ON pd.day_id = sta.day_id
      JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
      WHERE st.shop_id = ?
      ORDER BY pd.date ASC
      `,
      [id]
    );

    // Format the dates in processionDays
    const formattedProcessionDays = processionDays.map((day) => ({
      ...day,
      date: formatDateString(day.date),
    }));

    return res.status(200).json({
      success: true,
      shop,
      processionDays: formattedProcessionDays,
    });
  } catch (error) {
    console.error("Error fetching shop:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching shop",
      error: error.message,
    });
  }
};

/**
 * Create a new shop (seller or admin only)
 */
exports.createShop = async (req, res) => {
  try {
    const { sellerId, name, street, latitude, longitude, description } =
      req.body;

    // Validate required fields
    if (!sellerId || !name || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // If the user is a seller, verify they can only create shops for themselves
    if (req.user.role === "seller") {
      // Get seller ID for the current user
      const sellerResult = await query(
        "SELECT seller_id FROM sellers s JOIN users u ON s.user_id = u.user_id WHERE u.user_id = ?",
        [req.user.id]
      );

      if (
        sellerResult.length === 0 ||
        sellerResult[0].seller_id !== parseInt(sellerId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Sellers can only create shops for themselves",
        });
      }
    }

    // Verify the seller exists
    const sellerExists = await query(
      "SELECT seller_id FROM sellers WHERE seller_id = ?",
      [sellerId]
    );

    if (sellerExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Handle image uploads if present
    const images = {
      image1: req.files?.image1?.[0]?.filename || null,
      image2: req.files?.image2?.[0]?.filename || null,
      image3: req.files?.image3?.[0]?.filename || null,
      image4: req.files?.image4?.[0]?.filename || null,
    };

    // Insert shop record
    const result = await query(
      `INSERT INTO shops 
       (seller_id, name, street, latitude, longitude, image1, image2, image3, image4, description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sellerId,
        name,
        street || null,
        latitude,
        longitude,
        images.image1,
        images.image2,
        images.image3,
        images.image4,
        description || null,
      ]
    );

    const shopId = result.insertId;

    // Log activity
    await query(
      "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'shop_created', ?, ?, 'shop')",
      [req.user.id, req.user.role, `Created shop: ${name}`, shopId]
    );

    // Return created shop with image URLs
    const shopWithUrls = {
      shop_id: shopId,
      seller_id: parseInt(sellerId),
      name,
      street,
      latitude,
      longitude,
      description,
      image1: images.image1
        ? generateImageUrl(req, `uploads/shops/${images.image1}`)
        : null,
      image2: images.image2
        ? generateImageUrl(req, `uploads/shops/${images.image2}`)
        : null,
      image3: images.image3
        ? generateImageUrl(req, `uploads/shops/${images.image3}`)
        : null,
      image4: images.image4
        ? generateImageUrl(req, `uploads/shops/${images.image4}`)
        : null,
      created_at: new Date(),
    };

    return res.status(201).json({
      success: true,
      message: "Shop created successfully",
      shop: shopWithUrls,
    });
  } catch (error) {
    console.error("Error creating shop:", error);

    // Clean up uploaded files if there was an error
    if (req.files) {
      Object.values(req.files).forEach((fileArr) => {
        if (fileArr[0] && fileArr[0].path) {
          try {
            fs.unlinkSync(fileArr[0].path);
          } catch (unlinkErr) {
            console.error("Error deleting uploaded file:", unlinkErr);
          }
        }
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error creating shop",
      error: error.message,
    });
  }
};

/**
 * Update a shop
 */
exports.updateShop = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if the shop exists and get its seller info
    const shopResults = await query(
      "SELECT shop_id, seller_id FROM shops WHERE shop_id = ?",
      [id]
    );

    if (shopResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    const shop = shopResults[0];

    // Check if user is updating only images (for sellers)
    const requestFields = Object.keys(req.body);
    const imageFields = ["image1", "image2", "image3", "image4"];
    const isImageOnlyUpdate = requestFields.every(
      (field) => imageFields.includes(field) || field === "shop_id"
    );

    // Check if seller is only updating last two images (image3, image4)
    const lastTwoImagesOnly =
      requestFields.every(
        (field) =>
          ["image3", "image4", "shop_id"].includes(field) ||
          imageFields.includes(field)
      ) &&
      (requestFields.includes("image3") || requestFields.includes("image4"));

    const { name, street, latitude, longitude, description } = req.body;

    const updates = {};

    if (name !== undefined) updates.name = name;
    if (street !== undefined) updates.street = street;
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (description !== undefined) updates.description = description; // Handle image uploads if present
    if (req.files) {
      if (req.files.image1) updates.image1 = req.files.image1[0].filename;
      if (req.files.image2) updates.image2 = req.files.image2[0].filename;
      if (req.files.image3) updates.image3 = req.files.image3[0].filename;
      if (req.files.image4) updates.image4 = req.files.image4[0].filename;
    }

    // Handle image URLs from JSON body (for ImgBB URLs or null values)
    if (req.body.image3 !== undefined) {
      updates.image3 = req.body.image3; // Can be null or ImgBB URL
    }
    if (req.body.image4 !== undefined) {
      updates.image4 = req.body.image4; // Can be null or ImgBB URL
    }

    // If no updates are provided
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No update data provided",
      });
    }

    // Get current images before updating
    const currentShop = await query(
      "SELECT image1, image2, image3, image4 FROM shops WHERE shop_id = ?",
      [id]
    );

    // Build dynamic update query
    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(", ");

    const values = Object.values(updates);
    values.push(id);

    // Execute update
    await query(`UPDATE shops SET ${setClause} WHERE shop_id = ?`, values);

    // Delete old images if replaced
    if (currentShop.length > 0) {
      const oldImages = currentShop[0];

      if (updates.image1 && oldImages.image1) {
        const oldPath = path.join(
          __dirname,
          "../uploads/shops",
          oldImages.image1
        );
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      if (updates.image2 && oldImages.image2) {
        const oldPath = path.join(
          __dirname,
          "../uploads/shops",
          oldImages.image2
        );
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      if (updates.image3 && oldImages.image3) {
        const oldPath = path.join(
          __dirname,
          "../uploads/shops",
          oldImages.image3
        );
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      if (updates.image4 && oldImages.image4) {
        const oldPath = path.join(
          __dirname,
          "../uploads/shops",
          oldImages.image4
        );
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    // Log activity
    await query(
      "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'shop_updated', ?, ?, 'shop')",
      [req.user.id, req.user.role, `Updated shop with ID: ${id}`, id]
    );

    // Get updated shop data
    const [updatedShop] = await query(
      `
      SELECT s.shop_id, s.seller_id, s.name, s.street, 
             s.latitude, s.longitude, s.image1, s.image2, 
             s.image3, s.image4, s.description, s.created_at
      FROM shops s
      WHERE s.shop_id = ?
      `,
      [id]
    );

    // Process image URLs
    if (updatedShop) {
      updatedShop.image1 = updatedShop.image1
        ? generateImageUrl(req, `uploads/shops/${updatedShop.image1}`)
        : null;
      updatedShop.image2 = updatedShop.image2
        ? generateImageUrl(req, `uploads/shops/${updatedShop.image2}`)
        : null;
      updatedShop.image3 = updatedShop.image3
        ? generateImageUrl(req, `uploads/shops/${updatedShop.image3}`)
        : null;
      updatedShop.image4 = updatedShop.image4
        ? generateImageUrl(req, `uploads/shops/${updatedShop.image4}`)
        : null;
    }

    return res.status(200).json({
      success: true,
      message: "Shop updated successfully",
      shop: updatedShop,
    });
  } catch (error) {
    console.error("Error updating shop:", error);

    // Clean up uploaded files if there was an error
    if (req.files) {
      Object.values(req.files).forEach((fileArr) => {
        if (fileArr[0] && fileArr[0].path) {
          try {
            fs.unlinkSync(fileArr[0].path);
          } catch (unlinkErr) {
            console.error("Error deleting uploaded file:", unlinkErr);
          }
        }
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error updating shop",
      error: error.message,
    });
  }
};

/**
 * Delete a shop (admin only)
 */
exports.deleteShop = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if shop exists and get image paths for deletion
    const shopResults = await query(
      "SELECT shop_id, image1, image2, image3, image4 FROM shops WHERE shop_id = ?",
      [id]
    );

    if (shopResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    // Check if shop has any bookings
    const bookingsCount = await query(
      "SELECT COUNT(*) as count FROM bookings WHERE shop_id = ?",
      [id]
    );

    if (bookingsCount[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete shop with existing bookings",
      });
    }

    const shop = shopResults[0];

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Delete seat type availability records
      await query(
        `DELETE sta FROM seat_type_availability sta
         JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
         WHERE st.shop_id = ?`,
        [id]
      );

      // Delete seat types
      await query("DELETE FROM seat_types WHERE shop_id = ?", [id]);

      // Delete cart items
      await query("DELETE FROM cart_items WHERE shop_id = ?", [id]);

      // Delete the shop
      await query("DELETE FROM shops WHERE shop_id = ?", [id]);

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'shop_deleted', ?, ?, 'shop')",
        [req.user.id, req.user.role, `Deleted shop with ID: ${id}`, id]
      );

      // Commit transaction
      await query("COMMIT");

      // Delete shop images if they exist
      const imagePaths = [shop.image1, shop.image2, shop.image3, shop.image4]
        .filter((img) => img)
        .map((img) => path.join(__dirname, "../uploads/shops", img));

      imagePaths.forEach((imgPath) => {
        if (fs.existsSync(imgPath)) {
          fs.unlinkSync(imgPath);
        }
      });

      return res.status(200).json({
        success: true,
        message: "Shop deleted successfully",
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error deleting shop:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting shop",
      error: error.message,
    });
  }
};

/**
 * Get shops by seller ID
 */
exports.getSellerShops = async (req, res) => {
  try {
    const { sellerId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // First determine if sellerId is a Firebase UID or database seller_id
    let targetSellerId;
    let targetFirebaseUid;

    // Check if sellerId looks like a Firebase UID (contains letters/long string) or database ID (number)
    if (isNaN(sellerId) || sellerId.length > 10) {
      // Likely a Firebase UID, look up the seller
      targetFirebaseUid = sellerId;
      const sellerLookup = await query(
        `SELECT s.seller_id, s.user_id, u.firebase_uid 
         FROM sellers s 
         JOIN users u ON s.user_id = u.user_id 
         WHERE u.firebase_uid = ?`,
        [sellerId]
      );

      if (sellerLookup.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Seller not found",
        });
      }

      targetSellerId = sellerLookup[0].seller_id;
    } else {
      // Likely a database seller_id
      targetSellerId = parseInt(sellerId);
      const sellerLookup = await query(
        `SELECT s.seller_id, s.user_id, u.firebase_uid 
         FROM sellers s 
         JOIN users u ON s.user_id = u.user_id 
         WHERE s.seller_id = ?`,
        [targetSellerId]
      );

      if (sellerLookup.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Seller not found",
        });
      }
      targetFirebaseUid = sellerLookup[0].firebase_uid;
    }

    // Get shops for the seller
    const shops = await query(
      `
      SELECT s.shop_id, s.name, s.street, s.latitude, s.longitude, 
             s.image1, s.image2, s.image3, s.image4, s.description, s.created_at
      FROM shops s
      WHERE s.seller_id = ?
      ORDER BY s.created_at DESC
      `,
      [targetSellerId]
    );

    // Process image URLs for each shop
    const processedShops = shops.map((shop) => ({
      ...shop,
      image1: shop.image1
        ? generateImageUrl(req, `uploads/shops/${shop.image1}`)
        : null,
      image2: shop.image2
        ? generateImageUrl(req, `uploads/shops/${shop.image2}`)
        : null,
      image3: shop.image3
        ? generateImageUrl(req, `uploads/shops/${shop.image3}`)
        : null,
      image4: shop.image4
        ? generateImageUrl(req, `uploads/shops/${shop.image4}`)
        : null,
    })); // Get additional metrics for each shop
    for (let shop of processedShops) {
      // Get seat types count and total seats from availability table
      const seatTypesResult = await query(
        `SELECT COUNT(DISTINCT st.seat_type_id) as count, 
                COALESCE(SUM(sta.quantity), 0) as total_seats 
         FROM seat_types st 
         LEFT JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id 
         WHERE st.shop_id = ?`,
        [shop.shop_id]
      ); // Get bookings count and revenue
      const bookingsResult = await query(
        `
        SELECT 
          COUNT(*) as total_bookings,
          SUM(CASE WHEN status = 'confirmed' THEN quantity ELSE 0 END) as confirmed_bookings,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
          SUM(CASE WHEN status = 'confirmed' THEN total_price ELSE 0 END) as total_revenue
        FROM bookings 
        WHERE shop_id = ?
        `,
        [shop.shop_id]
      );
      shop.seat_types_count = seatTypesResult[0].count || 0;
      shop.total_seats = seatTypesResult[0].total_seats || 0;
      shop.total_bookings = bookingsResult[0].total_bookings || 0;
      shop.confirmed_bookings = bookingsResult[0].confirmed_bookings || 0;
      shop.pending_bookings = bookingsResult[0].pending_bookings || 0;
      shop.total_revenue = parseFloat(bookingsResult[0].total_revenue) || 0;

      // Calculate available seats: total seats minus confirmed bookings
      shop.available_seats = Math.max(
        0,
        (shop.total_seats || 0) - (shop.confirmed_bookings || 0)
      );
    }

    return res.status(200).json({
      success: true,
      count: processedShops.length,
      shops: processedShops,
    });
  } catch (error) {
    console.error("Error fetching seller shops:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seller shops",
      error: error.message,
    });
  }
};

/**
 * Task 5: Search shops with filters for find seats page
 */
exports.searchShops = async (req, res) => {
  try {
    const { day_id, street, price_min, price_max } = req.query;

    let sql = `
      SELECT DISTINCT s.shop_id, s.name, s.street, s.image1,
             MIN(sta.price) as min_price,
             SUM(sta.quantity - COALESCE(
               (SELECT SUM(b.quantity) 
                FROM bookings b 
                WHERE b.seat_type_id = sta.seat_type_id 
                AND b.day_id = sta.day_id 
                AND b.status IN ('confirmed', 'paid')), 0
             )) as available_seats
      FROM shops s
      JOIN seat_types st ON s.shop_id = st.shop_id
      JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id
      WHERE sta.available = TRUE
      AND (sta.quantity - COALESCE(
        (SELECT SUM(b.quantity) 
         FROM bookings b 
         WHERE b.seat_type_id = sta.seat_type_id 
         AND b.day_id = sta.day_id 
         AND b.status IN ('confirmed', 'paid')), 0
      )) > 0
    `;

    const params = [];

    // Filter by day if provided
    if (day_id && day_id !== "null") {
      sql += ` AND sta.day_id = ?`;
      params.push(day_id);
    }

    // Filter by street if provided
    if (street && street !== "All Streets") {
      sql += ` AND s.street = ?`;
      params.push(street);
    }

    // Filter by price range - this ensures shops have at least one seat type within the range
    if (price_min !== undefined && price_min !== null) {
      sql += ` AND sta.price >= ?`;
      params.push(parseFloat(price_min));
    }

    if (price_max !== undefined && price_max !== null) {
      sql += ` AND sta.price <= ?`;
      params.push(parseFloat(price_max));
    }

    sql += ` GROUP BY s.shop_id, s.name, s.street, s.image1`;
    sql += ` HAVING available_seats > 0`; // Only show shops with available seats
    sql += ` ORDER BY min_price ASC`;

    console.log("🔍 [Search Debug] SQL Query:", sql);
    console.log("🔍 [Search Debug] Parameters:", params);

    const shops = await query(sql, params);

    console.log(
      `🔍 [Search Debug] Found ${shops.length} shops matching filters`
    );

    // Generate full image URLs
    const shopsWithImages = shops.map((shop) => ({
      ...shop,
      image_url: generateImageUrl(req, shop.image1),
    }));

    return res.status(200).json({
      success: true,
      data: shopsWithImages,
    });
  } catch (error) {
    console.error("❌ [Search Debug] Error searching shops:", error);
    return res.status(500).json({
      success: false,
      message: "Error searching shops",
      error: error.message,
    });
  }
};
