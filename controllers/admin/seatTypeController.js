const { query } = require("../../config/database-schema");
const imgbbService = require("../../services/imgbbService");

// Helper functions
const formatDateString = (date) => {
  if (!date) return null;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
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

// Get seat types by shop ID
exports.getSeatTypesByShop = async (req, res) => {
  try {
    const { shopId } = req.params;
    const { dayId } = req.query;

    if (!shopId || isNaN(shopId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop ID"
      });
    }

    const queryText = `
      SELECT 
        st.seat_type_id,
        st.name,
        st.description,
        st.image_url,
        st.shop_id,
        COALESCE(sta.price, 0) as price,
        COALESCE(sta.quantity, 0) as quantity_available,
        COALESCE(sta.available, 0) as is_available
      FROM seat_types st
      LEFT JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id
        AND sta.day_id = ?
      WHERE st.shop_id = ?
      ORDER BY st.seat_type_id
    `;

    const seatTypes = await query(queryText, [dayId || null, shopId]);

    return res.status(200).json({
      success: true,
      seatTypes
    });
  } catch (error) {
    console.error("Error fetching seat types:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seat types",
      error: error.message
    });
  }
};

// Get seat type by ID
exports.getSeatTypeById = async (req, res) => {
  try {
    const { id } = req.params;

    const seatTypeResults = await query(`
      SELECT st.seat_type_id, st.shop_id, st.name, st.image_url, 
             st.description, st.created_at, st.updated_at,
             s.name as shop_name
      FROM seat_types st
      JOIN shops s ON st.shop_id = s.shop_id
      WHERE st.seat_type_id = ?
    `, [id]);

    if (seatTypeResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seat type not found",
      });
    }

    const seatType = seatTypeResults[0];

    const availabilityResults = await query(`
      SELECT sta.availability_id, sta.price, sta.quantity, sta.available,
             pd.day_id, pd.date
      FROM seat_type_availability sta
      JOIN procession_days pd ON sta.day_id = pd.day_id
      WHERE sta.seat_type_id = ?
      ORDER BY pd.date ASC
    `, [id]);

    const formattedAvailability = availabilityResults.map(avail => ({
      ...avail,
      date: formatDateString(avail.date),
    }));

    return res.status(200).json({
      success: true,
      seatType,
      availability: formattedAvailability,
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
exports.createSeatType = async (req, res) => {
  try {
    console.log('Received request body:', req.body);
    
    const { name, description, shop_id, image_url } = req.body;

    // Validate required fields
    if (!name || !shop_id) {
      return res.status(400).json({
        success: false,
        message: "Name and shop ID are required"
      });
    }

    // Check if shop exists
    const [shop] = await query("SELECT shop_id FROM shops WHERE shop_id = ?", [shop_id]);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found"
      });
    }

    // Insert into database
    const result = await query(
      "INSERT INTO seat_types (name, description, shop_id, image_url) VALUES (?, ?, ?, ?)",
      [name, description || null, shop_id, image_url || null]
    );

    // Get the newly created record
    const [newSeatType] = await query(
      "SELECT * FROM seat_types WHERE seat_type_id = ?",
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      seatType: newSeatType
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};
// Update seat type
exports.updateSeatType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, image_url } = req.body;

    const seatTypeResults = await query(
      "SELECT seat_type_id FROM seat_types WHERE seat_type_id = ?",
      [id]
    );

    if (seatTypeResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seat type not found",
      });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (image_url !== undefined) updates.image_url = image_url;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No update data provided",
      });
    }

    const setClause = Object.keys(updates)
      .map(key => `${key} = ?`)
      .join(", ");
    const values = Object.values(updates);
    values.push(id);

    await query(
      `UPDATE seat_types SET ${setClause} WHERE seat_type_id = ?`,
      values
    );

    const [updatedSeatType] = await query(
      "SELECT * FROM seat_types WHERE seat_type_id = ?",
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Seat type updated successfully",
      seatType: updatedSeatType,
    });
  } catch (error) {
    console.error("Error updating seat type:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating seat type",
      error: error.message,
    });
  }
};

// Delete seat type
exports.deleteSeatType = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const seatTypeResults = await query(`
      SELECT st.seat_type_id, st.shop_id, st.image_url,
             s.seller_id
      FROM seat_types st
      JOIN shops s ON st.shop_id = s.shop_id
      WHERE st.seat_type_id = ?
    `, [id]);

    if (seatTypeResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seat type not found",
      });
    }

    const seatType = seatTypeResults[0];
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

    await query("START TRANSACTION");
    try {
      await query("DELETE FROM seat_type_availability WHERE seat_type_id = ?", [id]);
      await query("DELETE FROM cart_items WHERE seat_type_id = ?", [id]);
      await query("DELETE FROM seat_types WHERE seat_type_id = ?", [id]);

      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seat_type_deleted', ?, ?, 'seat_type')",
        [req.user.id, req.user.role, `Deleted seat type with ID: ${id}`, id]
      );

      await query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Seat type deleted successfully",
      });
    } catch (error) {
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