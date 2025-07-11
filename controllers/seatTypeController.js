// controllers/seatTypeController.js
const { query } = require("../config/database-schema");
const fs = require("fs");
const path = require("path");
const imgbbService = require("../services/imgbbService");

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

  // If it's already a string in the correct format, return it
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // If it's a Date object, format it properly
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // For other cases, try to create a Date object and format it
  try {
    const dateObj = new Date(date);
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
 * Get all seat types for a shop
 */
exports.getSeatTypesByShopId = async (req, res) => {
  try {
    const { shopId } = req.params;
    const { day } = req.query;

    // Verify shop exists
    const shopExists = await query(
      "SELECT shop_id FROM shops WHERE shop_id = ?",
      [shopId]
    );

    if (shopExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    // Get seat types
    let seatTypesQuery = `
      SELECT st.seat_type_id, st.name, st.image_url, st.description,
             st.created_at, st.updated_at
      FROM seat_types st
      WHERE st.shop_id = ?
      ORDER BY st.name ASC
    `;

    const seatTypes = await query(seatTypesQuery, [shopId]);

    // Process seat types and add availability if day is provided
    const processedSeatTypes = await Promise.all(
      seatTypes.map(async (seatType) => {
        // Process image URL
        const processed = {
          ...seatType,
          image_url: seatType.image_url
            ? generateImageUrl(req, `uploads/seat_types/${seatType.image_url}`)
            : null,
        };

        // Add availability info if day is provided
        if (day) {
          const availabilityResults = await query(
            `
          SELECT sta.availability_id, sta.price, sta.quantity, sta.available, 
                 pd.date, pd.day_id
          FROM seat_type_availability sta
          JOIN procession_days pd ON sta.day_id = pd.day_id
          WHERE sta.seat_type_id = ? AND pd.date = ?
          `,
            [seatType.seat_type_id, day]
          );
          if (availabilityResults.length > 0) {
            const availability = availabilityResults[0];
            processed.availability = {
              ...availability,
              date: formatDateString(availability.date),
            };
          } else {
            processed.availability = {
              price: 0,
              quantity: 0,
              available: false,
            };
          }
        }

        return processed;
      })
    );

    return res.status(200).json({
      success: true,
      count: processedSeatTypes.length,
      seatTypes: processedSeatTypes,
    });
  } catch (error) {
    console.error("Error fetching seat types:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seat types",
      error: error.message,
    });
  }
};

/**
 * Get seat type by ID
 */
exports.getSeatTypeById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get seat type details
    const seatTypeResults = await query(
      `
      SELECT st.seat_type_id, st.shop_id, st.name, st.image_url, 
             st.description, st.created_at, st.updated_at,
             s.name as shop_name
      FROM seat_types st
      JOIN shops s ON st.shop_id = s.shop_id
      WHERE st.seat_type_id = ?
      `,
      [id]
    );

    if (seatTypeResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seat type not found",
      });
    }

    const seatType = seatTypeResults[0];

    // Process image URL
    seatType.image_url = seatType.image_url
      ? generateImageUrl(req, `uploads/seat_types/${seatType.image_url}`)
      : null;

    // Get availability for all days
    const availabilityResults = await query(
      `
      SELECT sta.availability_id, sta.price, sta.quantity, sta.available,
             pd.day_id, pd.date
      FROM seat_type_availability sta
      JOIN procession_days pd ON sta.day_id = pd.day_id
      WHERE sta.seat_type_id = ?
      ORDER BY pd.date ASC
      `,
      [id]
    );

    const formattedAvailabilityResults = availabilityResults.map((avail) => ({
      ...avail,
      date: formatDateString(avail.date),
    }));

    return res.status(200).json({
      success: true,
      seatType,
      availability: formattedAvailabilityResults, // Use formatted results
    });
  } catch (error) {
    console.error("Error fetching seat type:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seat type",
      error: error.message,
    });
  }
};

/**
 * Create a seat type with ImgBB image upload and availability data
 */
exports.createSeatType = async (req, res) => {
  try {
    const { shopId, name, description, imageData, availabilityData } = req.body;

    if (!shopId || !name) {
      return res.status(400).json({
        success: false,
        message: "Shop ID and name are required",
      });
    }

    // Parse availability data if provided
    let availability = [];
    if (availabilityData) {
      try {
        availability = JSON.parse(availabilityData);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: "Invalid availability data format",
        });
      }
    }

    // Check shop existence
    const shopResults = await query(
      `SELECT s.shop_id, s.seller_id
       FROM shops s
       WHERE s.shop_id = ?`,
      [shopId]
    );

    if (shopResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    let imageUrl = null;
    let imgbbData = null;

    // Handle image upload to ImgBB if provided
    if (imageData) {
      const imgbbResult = await imgbbService.uploadImage(
        imageData,
        `seat_type_${name}`
      );
      if (imgbbResult.success) {
        imageUrl = imgbbResult.data.url;
        imgbbData = imgbbResult.data;
      } else {
        return res.status(400).json({
          success: false,
          message: "Failed to upload image",
          error: imgbbResult.error,
        });
      }
    }

    // Start database transaction
    await query("START TRANSACTION");

    try {
      // Insert seat type record
      const result = await query(
        "INSERT INTO seat_types (shop_id, name, image_url, description) VALUES (?, ?, ?, ?)",
        [shopId, name, imageUrl, description || null]
      );

      const seatTypeId = result.insertId;

      // Insert availability data if provided
      if (availability && availability.length > 0) {
        for (const avail of availability) {
          // Validate procession day exists
          const dayExists = await query(
            "SELECT day_id FROM procession_days WHERE day_id = ?",
            [avail.day_id]
          );

          if (dayExists.length > 0) {
            await query(
              `INSERT INTO seat_type_availability (seat_type_id, day_id, price, quantity, available) 
               VALUES (?, ?, ?, ?, ?)`,
              [
                seatTypeId,
                avail.day_id,
                parseFloat(avail.price) || 0.0,
                parseInt(avail.quantity) || 0,
                avail.available !== false,
              ]
            );
          }
        }
      }

      // Commit transaction
      await query("COMMIT");

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seat_type_created', ?, ?, 'seat_type')",
        [
          req.user.id,
          req.user.role,
          `Created seat type: ${name} for shop ID: ${shopId}`,
          seatTypeId,
        ]
      );

      // Return created seat type with availability
      const seatType = {
        seat_type_id: seatTypeId,
        shop_id: parseInt(shopId),
        name,
        description: description || null,
        image_url: imageUrl,
        created_at: new Date(),
        updated_at: new Date(),
        imgbb_data: imgbbData, // Include ImgBB metadata for frontend
      };

      return res.status(201).json({
        success: true,
        message: "Seat type created successfully",
        seatType,
      });
    } catch (dbError) {
      // Rollback transaction
      await query("ROLLBACK");

      // Delete uploaded image from ImgBB if database operation failed
      if (imgbbData && imgbbData.delete_url) {
        await imgbbService.deleteImage(imgbbData.delete_url);
      }

      throw dbError;
    }
  } catch (error) {
    console.error("Error creating seat type:", error);

    return res.status(500).json({
      success: false,
      message: "Error creating seat type",
      error: error.message,
    });
  }
};

/**
 * Update a seat type with ImgBB image handling and availability data
 */
exports.updateSeatType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, imageData, availabilityData } = req.body;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if seat type exists and get current data
    const seatTypeResults = await query(
      `SELECT st.seat_type_id, st.shop_id, st.image_url, st.name, st.description,
              s.seller_id
       FROM seat_types st
       JOIN shops s ON st.shop_id = s.shop_id
       WHERE st.seat_type_id = ?`,
      [id]
    );

    if (seatTypeResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seat type not found",
      });
    }

    const currentSeatType = seatTypeResults[0];

    // Parse availability data if provided
    let availability = [];
    if (availabilityData) {
      try {
        availability = JSON.parse(availabilityData);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: "Invalid availability data format",
        });
      }
    }

    const updates = {};
    let newImageUrl = currentSeatType.image_url;
    let imgbbData = null;

    // Prepare basic updates
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    // Handle image update if provided
    if (imageData) {
      // Upload new image to ImgBB
      const imgbbResult = await imgbbService.uploadImage(
        imageData,
        `seat_type_${name || currentSeatType.name}`
      );
      if (imgbbResult.success) {
        newImageUrl = imgbbResult.data.url;
        imgbbData = imgbbResult.data;
        updates.image_url = newImageUrl;
      } else {
        return res.status(400).json({
          success: false,
          message: "Failed to upload new image",
          error: imgbbResult.error,
        });
      }
    }

    // Start database transaction
    await query("START TRANSACTION");

    try {
      // Update seat type basic information if there are updates
      if (Object.keys(updates).length > 0) {
        const setClause = Object.keys(updates)
          .map((key) => `${key} = ?`)
          .join(", ");

        const values = Object.values(updates);
        values.push(id);

        await query(
          `UPDATE seat_types SET ${setClause} WHERE seat_type_id = ?`,
          values
        );
      }

      // Update availability data if provided
      if (availability && availability.length > 0) {
        // First, remove existing availability records
        await query(
          "DELETE FROM seat_type_availability WHERE seat_type_id = ?",
          [id]
        );

        // Insert new availability records
        for (const avail of availability) {
          // Validate procession day exists
          const dayExists = await query(
            "SELECT day_id FROM procession_days WHERE day_id = ?",
            [avail.day_id]
          );

          if (dayExists.length > 0) {
            await query(
              `INSERT INTO seat_type_availability (seat_type_id, day_id, price, quantity, available) 
               VALUES (?, ?, ?, ?, ?)`,
              [
                id,
                avail.day_id,
                parseFloat(avail.price) || 0.0,
                parseInt(avail.quantity) || 0,
                avail.available !== false,
              ]
            );
          }
        }
      }

      // Commit transaction
      await query("COMMIT");

      // If image was updated successfully, try to delete old image from ImgBB
      // Note: This is best effort - if it fails, we don't break the operation
      if (
        imageData &&
        currentSeatType.image_url &&
        currentSeatType.image_url !== newImageUrl
      ) {
        // Attempt to extract delete URL or use stored delete URL
        // In a production system, you should store the delete_url from ImgBB upload response
        console.log(
          "Note: Previous image cleanup not implemented. Store delete_url from ImgBB uploads for proper cleanup."
        );
      }

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seat_type_updated', ?, ?, 'seat_type')",
        [req.user.id, req.user.role, `Updated seat type with ID: ${id}`, id]
      );

      // Get updated seat type data with availability
      const [updatedSeatType] = await query(
        `SELECT st.seat_type_id, st.shop_id, st.name, st.image_url, 
                st.description, st.created_at, st.updated_at
         FROM seat_types st
         WHERE st.seat_type_id = ?`,
        [id]
      );

      // Get availability data
      const availabilityResults = await query(
        `SELECT sta.availability_id, sta.day_id, sta.price, sta.quantity, sta.available,
                pd.date
         FROM seat_type_availability sta
         JOIN procession_days pd ON sta.day_id = pd.day_id
         WHERE sta.seat_type_id = ?
         ORDER BY pd.date ASC`,
        [id]
      );

      return res.status(200).json({
        success: true,
        message: "Seat type updated successfully",
        seatType: {
          ...updatedSeatType,
          availability: availabilityResults,
          imgbb_data: imgbbData, // Include ImgBB metadata for frontend
        },
      });
    } catch (dbError) {
      // Rollback transaction
      await query("ROLLBACK");

      // Delete newly uploaded image from ImgBB if database operation failed
      if (imgbbData && imgbbData.delete_url) {
        await imgbbService.deleteImage(imgbbData.delete_url);
      }

      throw dbError;
    }
  } catch (error) {
    console.error("Error updating seat type:", error);

    return res.status(500).json({
      success: false,
      message: "Error updating seat type",
      error: error.message,
    });
  }
};

/**
 * Update seat type availability for a specific day
 */
exports.updateSeatTypeAvailability = async (req, res) => {
  try {
    const { id, dayId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { price, quantity, available } = req.body;

    if (
      price === undefined &&
      quantity === undefined &&
      available === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "No update data provided",
      });
    } // Check if seat type exists and get shop info
    const seatTypeResults = await query(
      `
      SELECT st.seat_type_id, st.shop_id,
             s.seller_id
      FROM seat_types st
      JOIN shops s ON st.shop_id = s.shop_id
      WHERE st.seat_type_id = ?
      `,
      [id]
    );

    if (seatTypeResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seat type not found",
      });
    }

    // Check if day exists
    const dayExists = await query(
      "SELECT day_id FROM procession_days WHERE day_id = ?",
      [dayId]
    );

    if (dayExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Procession day not found",
      });
    }
    const seatType = seatTypeResults[0];

    // Check if availability record exists
    const availabilityResults = await query(
      "SELECT availability_id FROM seat_type_availability WHERE seat_type_id = ? AND day_id = ?",
      [id, dayId]
    );

    // Prepare update data
    const updateData = {};
    if (price !== undefined) updateData.price = price;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (available !== undefined) updateData.available = available;

    // If record exists, update it
    if (availabilityResults.length > 0) {
      const setClause = Object.keys(updateData)
        .map((key) => `${key} = ?`)
        .join(", ");

      const values = Object.values(updateData);
      values.push(id, dayId);

      await query(
        `UPDATE seat_type_availability SET ${setClause} WHERE seat_type_id = ? AND day_id = ?`,
        values
      );
    } else {
      // Create new availability record
      if (price === undefined) updateData.price = 0;
      if (quantity === undefined) updateData.quantity = 0;
      if (available === undefined) updateData.available = true;

      await query(
        "INSERT INTO seat_type_availability (seat_type_id, day_id, price, quantity, available) VALUES (?, ?, ?, ?, ?)",
        [id, dayId, updateData.price, updateData.quantity, updateData.available]
      );
    }

    // Log activity
    await query(
      "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'availability_updated', ?, ?, 'seat_type')",
      [
        req.user.id,
        req.user.role,
        `Updated availability for seat type ID: ${id} on day ID: ${dayId}`,
        id,
      ]
    ); // Get updated availability
    const [updatedAvailability] = await query(
      `
      SELECT sta.availability_id, sta.seat_type_id, sta.day_id, 
             sta.price, sta.quantity, sta.available,
             pd.date
      FROM seat_type_availability sta
      JOIN procession_days pd ON sta.day_id = pd.day_id
      WHERE sta.seat_type_id = ? AND sta.day_id = ?
      `,
      [id, dayId]
    );

    const formattedAvailability = {
      ...updatedAvailability,
      date: formatDateString(updatedAvailability.date),
    };

    return res.status(200).json({
      success: true,
      message: "Seat type availability updated successfully",
      availability: formattedAvailability,
    });
  } catch (error) {
    console.error("Error updating seat type availability:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating seat type availability",
      error: error.message,
    });
  }
};

/**
 * Delete a seat type
 */
exports.deleteSeatType = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    } // Check if seat type exists and get shop info
    const seatTypeResults = await query(
      `
      SELECT st.seat_type_id, st.shop_id, st.image_url,
             s.seller_id
      FROM seat_types st
      JOIN shops s ON st.shop_id = s.shop_id
      WHERE st.seat_type_id = ?
      `,
      [id]
    );
    if (seatTypeResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seat type not found",
      });
    }

    const seatType = seatTypeResults[0];

    // Check if seat type has any bookings
    const bookingsCount = await query(
      "SELECT COUNT(*) as count FROM bookings WHERE seat_type_id = ?",
      [id]
    );

    if (bookingsCount[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete seat type with existing bookings",
      });
    }

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Delete availability records first (child records)
      await query("DELETE FROM seat_type_availability WHERE seat_type_id = ?", [
        id,
      ]);

      // Delete cart items with this seat type
      await query("DELETE FROM cart_items WHERE seat_type_id = ?", [id]);

      // Delete the seat type
      await query("DELETE FROM seat_types WHERE seat_type_id = ?", [id]);

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seat_type_deleted', ?, ?, 'seat_type')",
        [req.user.id, req.user.role, `Deleted seat type with ID: ${id}`, id]
      );

      // Commit transaction
      await query("COMMIT");

      // Delete image file if it exists
      if (seatType.image_url) {
        const imagePath = path.join(
          __dirname,
          "../uploads/seat_types",
          seatType.image_url
        );
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Seat type deleted successfully",
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error deleting seat type:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting seat type",
      error: error.message,
    });
  }
};
