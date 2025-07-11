const { query } = require("../../config/database-schema");


exports.getSeatTypeAvailability = async (req, res) => {
  try {
    const { seatTypeId, dayId } = req.params;

    // Check if seat type exists
    const seatTypeExists = await query(
      "SELECT seat_type_id FROM seat_types WHERE seat_type_id = ?",
      [seatTypeId]
    );

    if (seatTypeExists.length === 0) {
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

    // Get availability
    const availability = await query(
      `
      SELECT sta.availability_id, sta.seat_type_id, sta.day_id, 
             sta.price, sta.quantity, sta.available,
             pd.date, pd.event_name
      FROM seat_type_availability sta
      JOIN procession_days pd ON sta.day_id = pd.day_id
      WHERE sta.seat_type_id = ? AND sta.day_id = ?
      `,
      [seatTypeId, dayId]
    );

    if (availability.length === 0) {
      return res.status(200).json({
        success: true,
        availability: null,
        message: "No availability record found for this seat type and day",
      });
    }

    return res.status(200).json({
      success: true,
      availability: availability[0],
    });
  } catch (error) {
    console.error("Error fetching seat type availability:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seat type availability",
      error: error.message,
    });
  }
};


exports.createSeatTypeAvailability = async (req, res) => {
  try {
    const { seatTypeId } = req.params;
    const { dayId, price, quantity, available } = req.body;

    // Validate required fields
    if (!dayId || price === undefined || quantity === undefined || available === undefined) {
      return res.status(400).json({
        success: false,
        message: "Day ID, price, quantity, and availability status are required"
      });
    }

    // Check if seat type exists
    const seatTypeExists = await query(
      "SELECT seat_type_id, shop_id FROM seat_types WHERE seat_type_id = ?",
      [seatTypeId]
    );

    if (seatTypeExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seat type not found"
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
        message: "Procession day not found"
      });
    }

    // Check if availability already exists
    const existingAvailability = await query(
      "SELECT availability_id FROM seat_type_availability WHERE seat_type_id = ? AND day_id = ?",
      [seatTypeId, dayId]
    );

    if (existingAvailability.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Availability record already exists for this seat type and day"
      });
    }

    // Create new availability record
    const result = await query(
      `
      INSERT INTO seat_type_availability 
      (seat_type_id, day_id, price, quantity, available)
      VALUES (?, ?, ?, ?, ?)
      `,
      [seatTypeId, dayId, price, quantity, available]
    );

    // Get the newly created record
    const [newAvailability] = await query(
      `
      SELECT sta.*, pd.date, pd.event_name
      FROM seat_type_availability sta
      JOIN procession_days pd ON sta.day_id = pd.day_id
      WHERE sta.availability_id = ?
      `,
      [result.insertId]
    );

    // Log activity
    if (req.user) {
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, ?, ?, ?, ?)",
        [
          req.user.id,
          req.user.role,
          'availability_created',
          `Created availability for seat type ${seatTypeId} on day ${dayId}`,
          result.insertId,
          'seat_type_availability'
        ]
      );
    }

    return res.status(201).json({
      success: true,
      message: "Seat type availability created successfully",
      availability: newAvailability
    });
  } catch (error) {
    console.error("Error creating seat type availability:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating seat type availability",
      error: error.message
    });
  }
};


// exports.updateSeatTypeAvailability = async (req, res) => {
//   try {
//     const { seatTypeId, dayId } = req.params;
//     const { price, quantity, available } = req.body;

//     // Validate required fields
//     if (price === undefined || quantity === undefined || available === undefined) {
//       return res.status(400).json({
//         success: false,
//         message: "Price, quantity, and availability status are required"
//       });
//     }

//     // Check if seat type exists
//     const seatTypeExists = await query(
//       "SELECT seat_type_id FROM seat_types WHERE seat_type_id = ?",
//       [seatTypeId]
//     );

//     if (seatTypeExists.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Seat type not found"
//       });
//     }

//     // Check if day exists
//     const dayExists = await query(
//       "SELECT day_id FROM procession_days WHERE day_id = ?",
//       [dayId]
//     );

//     if (dayExists.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Procession day not found"
//       });
//     }

//     // Check if availability record exists
//     const availabilityExists = await query(
//       "SELECT availability_id FROM seat_type_availability WHERE seat_type_id = ? AND day_id = ?",
//       [seatTypeId, dayId]
//     );

//     if (availabilityExists.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Availability record not found"
//       });
//     }

//     // Update the record
//     await query(
//       `
//       UPDATE seat_type_availability 
//       SET price = ?, quantity = ?, available = ?, updated_at = NOW()
//       WHERE seat_type_id = ? AND day_id = ?
//       `,
//       [price, quantity, available, seatTypeId, dayId]
//     );

//     // Get the updated record
//     const [updatedAvailability] = await query(
//       `
//       SELECT sta.*, pd.date, pd.event_name
//       FROM seat_type_availability sta
//       JOIN procession_days pd ON sta.day_id = pd.day_id
//       WHERE sta.seat_type_id = ? AND sta.day_id = ?
//       `,
//       [seatTypeId, dayId]
//     );

//     // Log activity
//     if (req.user) {
//       await query(
//         "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, ?, ?, ?, ?)",
//         [
//           req.user.id,
//           req.user.role,
//           'availability_updated',
//           `Updated availability for seat type ${seatTypeId} on day ${dayId}`,
//           availabilityExists[0].availability_id,
//           'seat_type_availability'
//         ]
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Seat type availability updated successfully",
//       availability: updatedAvailability
//     });
//   } catch (error) {
//     console.error("Error updating seat type availability:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error updating seat type availability",
//       error: error.message
//     });
//   }
// };
exports.updateSeatTypeAvailability = async (req, res) => {
  try {
    const { seatTypeId, dayId } = req.params;
    const { price, quantity, available, day_id: newDayId } = req.body;

    // Validate required fields
    if (price === undefined || quantity === undefined || available === undefined) {
      return res.status(400).json({
        success: false,
        message: "Price, quantity, and availability status are required"
      });
    }

    // Check if seat type exists
    const seatTypeExists = await query(
      "SELECT seat_type_id FROM seat_types WHERE seat_type_id = ?",
      [seatTypeId]
    );

    if (seatTypeExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seat type not found"
      });
    }

    // Check if new day exists if we're changing days
    if (newDayId && newDayId !== dayId) {
      const dayExists = await query(
        "SELECT day_id FROM procession_days WHERE day_id = ?",
        [newDayId]
      );

      if (dayExists.length === 0) {
        return res.status(404).json({
          success: false,
          message: "New procession day not found"
        });
      }
    }

    // Update the record
    const updateDayId = newDayId || dayId;
    await query(
      `UPDATE seat_type_availability 
       SET price = ?, quantity = ?, available = ?, day_id = ?, updated_at = NOW()
       WHERE seat_type_id = ? AND day_id = ?`,
      [price, quantity, available, updateDayId, seatTypeId, dayId]
    );

    // Get the updated record
    const [updatedAvailability] = await query(
      `SELECT sta.*, pd.date, pd.event_name
       FROM seat_type_availability sta
       JOIN procession_days pd ON sta.day_id = pd.day_id
       WHERE sta.seat_type_id = ? AND sta.day_id = ?`,
      [seatTypeId, updateDayId]
    );

    return res.status(200).json({
      success: true,
      message: "Seat type availability updated successfully",
      availability: updatedAvailability
    });
  } catch (error) {
    console.error("Error updating seat type availability:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating seat type availability",
      error: error.message
    });
  }
};

exports.getAllAvailabilityForSeatType = async (req, res) => {
  try {
    const { seatTypeId } = req.params;

    // Check if seat type exists
    const seatTypeExists = await query(
      "SELECT seat_type_id FROM seat_types WHERE seat_type_id = ?",
      [seatTypeId]
    );

    if (seatTypeExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seat type not found",
      });
    }

    // Get all availability records
    const availability = await query(
      `
      SELECT sta.availability_id, sta.seat_type_id, sta.day_id, 
             sta.price, sta.quantity, sta.available,
             pd.date, pd.event_name
      FROM seat_type_availability sta
      JOIN procession_days pd ON sta.day_id = pd.day_id
      WHERE sta.seat_type_id = ?
      ORDER BY pd.date ASC
      `,
      [seatTypeId]
    );

    return res.status(200).json({
      success: true,
      count: availability.length,
      availability,
    });
  } catch (error) {
    console.error("Error fetching seat type availability:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seat type availability",
      error: error.message,
    });
  }
};


exports.deleteSeatTypeAvailability = async (req, res) => {
  try {
    const { availabilityId } = req.params;

   
    const availabilityExists = await query(
      "SELECT * FROM seat_type_availability WHERE availability_id = ?",
      [availabilityId]
    );

    if (availabilityExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Availability record not found",
      });
    }

    // Delete the record
    await query(
      "DELETE FROM seat_type_availability WHERE availability_id = ?",
      [availabilityId]
    );

    // Log activity
    if (req.user) {
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, ?, ?, ?, ?)",
        [
          req.user.id,
          req.user.role,
          'availability_deleted',
          `Deleted availability record ${availabilityId}`,
          availabilityId,
          'seat_type_availability'
        ]
      );
    }

    return res.status(200).json({
      success: true,
      message: "Availability record deleted successfully",
      deletedRecord: availabilityExists[0]
    });
  } catch (error) {
    console.error("Error deleting seat type availability:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting seat type availability",
      error: error.message,
    });
  }
};


exports.getProcessionDays = async (req, res) => {
  try {
    const { date } = req.query;
    let queryStr = 'SELECT * FROM procession_days';
    let params = [];
    
    if (date) {
      queryStr += ' WHERE date = ?';
      params.push(date);
    }
    
    queryStr += ' ORDER BY date ASC';
    
    const days = await query(queryStr, params);
    
    return res.status(200).json({
      success: true,
      data: days
    });
  } catch (error) {
    console.error('Error fetching procession days:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching procession days',
      error: error.message
    });
  }
};