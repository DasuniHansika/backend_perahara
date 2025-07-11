// routes/ticketVerification.js
const express = require("express");
const router = express.Router();
const { query } = require("../config/database-schema");
const {
  validateTicketNumber,
  parseTicketNumber,
} = require("../utils/ticketNumberGenerator");
const { verifyFirebaseToken } = require("../middleware/firebaseAuth");

/**
 * Helper function to format date as YYYY-MM-DD string (imported from seatTypeController)
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
 * Safely parse JSON data from database
 * @param {any} data - Data to parse
 * @returns {any} Parsed data or null
 */
function safeJsonParse(data) {
  if (data === null || data === undefined) {
    return null;
  }

  // If it's already an object, return it
  if (typeof data === "object" && data !== null) {
    return data;
  }

  // If it's a string, try to parse it
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error("❌ Failed to parse JSON:", error, "Data:", data);
      return null;
    }
  }

  return data;
}

/**
 * Verify ticket by ticket number - Seller only endpoint
 * GET /api/tickets/verify/:ticketNumber
 */
router.get("/verify/:ticketNumber", verifyFirebaseToken, async (req, res) => {
  const startTime = Date.now();
  console.log(
    `🎫 [TicketVerification] Starting verification request at ${new Date().toISOString()}`
  );

  try {
    const { ticketNumber } = req.params;
    console.log(
      `🎫 [TicketVerification] Requested ticket number: "${ticketNumber}"`
    );
    console.log(
      `👤 [TicketVerification] User: ${req.user?.uid || "unknown"}, Role: ${
        req.user?.role || "unknown"
      }`
    );

    // Check if user is a seller
    if (req.user.role !== "seller") {
      console.log(
        `❌ [TicketVerification] Access denied - user role: ${req.user.role}`
      );
      return res.status(403).json({
        success: false,
        error: "Access denied. This endpoint is only available to sellers.",
      });
    }
    console.log(`✅ [TicketVerification] Seller access confirmed`);

    // Validate ticket number format
    console.log(`🔍 [TicketVerification] Validating ticket number format...`);
    if (!validateTicketNumber(ticketNumber)) {
      console.log(
        `❌ [TicketVerification] Invalid ticket number format: "${ticketNumber}"`
      );
      return res.status(400).json({
        success: false,
        error: "Invalid ticket number format",
        ticketNumber,
      });
    }
    console.log(`✅ [TicketVerification] Ticket number format is valid`);

    // Look up ticket in database with complete information
    console.log(
      `🗄️ [TicketVerification] Querying database for ticket with complete details...`
    );
    const ticketResult = await query(
      `
      SELECT 
        ct.ticket_id,
        ct.ticket_no,
        ct.payhere_order_id,
        ct.payhere_payment_id,
        ct.ticket_url,
        ct.qrcode_url,
        ct.used,
        ct.created_at,
        ct.updated_at,
        ct.shop_id,
        ct.booking_id,
        ct.day_id,
        
        -- Customer information
        cc.first_name,
        cc.last_name,
        cc.email,
        cc.phone,
        
        -- Shop information
        s.name as shop_name,
        s.street as shop_address,
        s.latitude as shop_latitude,
        s.longitude as shop_longitude,
        
        -- Event information
        pd.event_name,
        pd.date as event_date,
        pd.color as event_color,
        
        -- Legacy JSON fields for backward compatibility
        ct.shop_info,
        ct.booking_info
        
      FROM customer_tickets ct
      LEFT JOIN checkout_customers cc ON ct.checkout_customer_id = cc.id
      LEFT JOIN shops s ON ct.shop_id = s.shop_id
      LEFT JOIN procession_days pd ON ct.day_id = pd.day_id
      WHERE ct.ticket_no = ?
    `,
      [ticketNumber]
    );

    console.log(
      `📊 [TicketVerification] Database query completed. Results found: ${ticketResult.length}`
    );

    if (ticketResult.length === 0) {
      console.log(`❌ [TicketVerification] Ticket not found in database`);
      return res.status(404).json({
        success: false,
        error: "Ticket not found",
        ticketNumber,
      });
    }

    const ticket = ticketResult[0];
    console.log(`✅ [TicketVerification] Ticket found: ID ${ticket.ticket_id}`);
    console.log(
      `📋 [TicketVerification] Customer: ${ticket.first_name} ${ticket.last_name} (${ticket.email})`
    );
    console.log(
      `🏪 [TicketVerification] Shop: ${ticket.shop_name || "Unknown"} (ID: ${
        ticket.shop_id || "N/A"
      })`
    );
    console.log(
      `📅 [TicketVerification] Event: ${ticket.event_name || "Unknown"} on ${
        ticket.event_date || "N/A"
      }`
    );

    // Get seat types and quantities for this ticket
    console.log(
      `🎫 [TicketVerification] Fetching seat type details for ticket...`
    );
    let seatTypeDetails = [];

    if (ticket.booking_id) {
      console.log(
        `📋 [TicketVerification] Fetching seat types from booking ID: ${ticket.booking_id}`
      );

      // Get seat type details from bookings table
      const seatTypesResult = await query(
        `
        SELECT 
          b.booking_id,
          b.quantity,
          b.total_price,
          st.name as seat_type_name,
          st.description as seat_type_description,
          sta.price as price_per_seat
        FROM bookings b
        JOIN seat_types st ON b.seat_type_id = st.seat_type_id
        LEFT JOIN seat_type_availability sta ON b.seat_type_id = sta.seat_type_id AND b.day_id = sta.day_id
        WHERE b.booking_id = ?
        `,
        [ticket.booking_id]
      );

      seatTypeDetails = seatTypesResult.map((seat) => ({
        seatType: seat.seat_type_name,
        description: seat.seat_type_description,
        quantity: seat.quantity,
        pricePerSeat: parseFloat(seat.price_per_seat || 0),
        subtotal: parseFloat(seat.total_price || 0),
      }));

      console.log(
        `✅ [TicketVerification] Found ${seatTypeDetails.length} seat type(s) for booking`
      );
    } else {
      console.log(
        `⚠️ [TicketVerification] No booking_id found, checking legacy booking_info...`
      );

      // Fallback to legacy booking_info JSON field
      const bookingInfo = safeJsonParse(ticket.booking_info);
      if (bookingInfo && bookingInfo.bookings) {
        seatTypeDetails = bookingInfo.bookings.map((booking) => ({
          seatType: booking.seat_type || booking.seatTypeName || "Unknown",
          description: booking.seat_description || booking.description || "",
          quantity: booking.quantity || 0,
          pricePerSeat:
            parseFloat(booking.price_per_seat || booking.amount || 0) /
            (booking.quantity || 1),
          subtotal: parseFloat(booking.amount || booking.total_amount || 0),
        }));
        console.log(
          `✅ [TicketVerification] Found ${seatTypeDetails.length} seat type(s) from legacy booking_info`
        );
      } else {
        console.log(
          `⚠️ [TicketVerification] No seat type details found in booking_info`
        );
      }
    }

    const parsedTicketNumber = parseTicketNumber(ticketNumber);
    console.log(
      `🔧 [TicketVerification] Parsed ticket number:`,
      parsedTicketNumber
    );

    // Parse JSON fields safely for backward compatibility
    console.log(`🔧 [TicketVerification] Parsing legacy JSON fields...`);
    const shopInfo = safeJsonParse(ticket.shop_info);
    const bookingInfo = safeJsonParse(ticket.booking_info);
    console.log(
      `📊 [TicketVerification] shop_info parsed: ${shopInfo !== null}`
    );
    console.log(
      `📊 [TicketVerification] booking_info parsed: ${bookingInfo !== null}`
    );

    // Format event date
    const formattedEventDate = formatDateString(ticket.event_date);
    console.log(
      `📅 [TicketVerification] Formatted event date: ${ticket.event_date} → ${formattedEventDate}`
    );

    const responseData = {
      success: true,
      ticket: {
        ticketNumber: ticket.ticket_no,
        ticketId: ticket.ticket_id,
        orderId: ticket.payhere_order_id,
        paymentId: ticket.payhere_payment_id,

        // Customer information
        customerInfo: {
          firstName: ticket.first_name,
          lastName: ticket.last_name,
          email: ticket.email,
          phone: ticket.phone,
        },

        // Shop information (prioritize database fields over JSON)
        shopInfo: {
          name:
            ticket.shop_name ||
            shopInfo?.shop_name ||
            shopInfo?.name ||
            "Unknown Shop",
          address:
            ticket.shop_address ||
            shopInfo?.location ||
            shopInfo?.address ||
            "Address not available",
          latitude:
            ticket.shop_latitude || shopInfo?.coordinates?.latitude || null,
          longitude:
            ticket.shop_longitude || shopInfo?.coordinates?.longitude || null,
        },

        // Event information (prioritize database fields over JSON)
        eventInfo: {
          name:
            ticket.event_name ||
            bookingInfo?.event_name ||
            "Kandy Esala Perahera",
          date: formattedEventDate || bookingInfo?.date || "Date not available",
          color: ticket.event_color || "#FF6B35", // Default orange color
        },

        // Seat type details
        seatTypes: seatTypeDetails,

        // Legacy fields for backward compatibility
        bookingInfo: bookingInfo,

        // Ticket metadata
        issuedDate: ticket.created_at,
        lastUpdated: ticket.updated_at,
        used: ticket.used || "no", // Include usage status
        parsedTicketNumber,
      },
    };

    const processingTime = Date.now() - startTime;
    console.log(
      `✅ [TicketVerification] Verification completed successfully in ${processingTime}ms`
    );
    console.log(
      `📊 [TicketVerification] Response includes: ${seatTypeDetails.length} seat type(s), shop: ${responseData.ticket.shopInfo.name}, event: ${responseData.ticket.eventInfo.name}`
    );

    // Return enhanced ticket verification data
    res.json(responseData);
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(
      `💥 [TicketVerification] Error after ${processingTime}ms:`,
      error
    );
    console.error(`📊 [TicketVerification] Error stack:`, error.stack);

    res.status(500).json({
      success: false,
      error: "Internal server error during ticket verification",
    });
  }
});

/**
 * Get tickets by customer
 * GET /api/tickets/customer/:customerId
 */
router.get("/customer/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    const tickets = await query(
      `
      SELECT 
        ct.ticket_id,
        ct.ticket_no,
        ct.payhere_order_id,
        ct.payhere_payment_id,
        ct.created_at,
        cc.first_name,
        cc.last_name,
        cc.email,
        ct.shop_info,
        ct.booking_info
      FROM customer_tickets ct
      LEFT JOIN checkout_customers cc ON ct.checkout_customer_id = cc.id
      WHERE ct.account_owner_id = ?
      ORDER BY ct.created_at DESC
    `,
      [customerId]
    );

    const formattedTickets = tickets.map((ticket) => ({
      ticketId: ticket.ticket_id,
      ticketNumber: ticket.ticket_no,
      orderId: ticket.payhere_order_id,
      paymentId: ticket.payhere_payment_id,
      customerInfo: {
        firstName: ticket.first_name,
        lastName: ticket.last_name,
        email: ticket.email,
      },
      shopInfo: safeJsonParse(ticket.shop_info),
      bookingInfo: safeJsonParse(ticket.booking_info),
      issuedDate: ticket.created_at,
      parsedTicketNumber: ticket.ticket_no
        ? parseTicketNumber(ticket.ticket_no)
        : null,
    }));

    res.json({
      success: true,
      tickets: formattedTickets,
      count: formattedTickets.length,
    });
  } catch (error) {
    console.error("❌ Customer tickets retrieval error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during tickets retrieval",
    });
  }
});

/**
 * Get ticket statistics
 * GET /api/tickets/stats
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN ticket_no IS NOT NULL THEN 1 END) as tickets_with_number,
        COUNT(CASE WHEN ticket_no IS NULL THEN 1 END) as tickets_without_number,
        COUNT(DISTINCT payhere_order_id) as unique_orders,
        DATE(MIN(created_at)) as first_ticket_date,
        DATE(MAX(created_at)) as last_ticket_date
      FROM customer_tickets
    `);

    res.json({
      success: true,
      statistics: stats[0],
    });
  } catch (error) {
    console.error("❌ Ticket statistics error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during statistics retrieval",
    });
  }
});

/**
 * Test endpoint to list available tickets (no auth required)
 * GET /api/tickets/list-test
 */
router.get("/list-test", async (req, res) => {
  try {
    console.log("🔍 [TicketVerification-TEST] Listing available tickets...");

    const tickets = await query(`
      SELECT 
        ct.ticket_no,
        ct.payhere_order_id,
        ct.created_at,
        c.first_name,
        c.last_name,
        s.name as shop_name
      FROM customer_tickets ct
      LEFT JOIN checkout_customers c ON ct.checkout_customer_id = c.id
      LEFT JOIN shops s ON ct.shop_id = s.shop_id
      WHERE ct.ticket_no IS NOT NULL
      ORDER BY ct.created_at DESC
      LIMIT 10
    `);

    console.log(`✅ [TicketVerification-TEST] Found ${tickets.length} tickets`);

    res.json({
      success: true,
      tickets: tickets.map((t) => ({
        ticketNumber: t.ticket_no,
        customer: `${t.first_name || "Unknown"} ${t.last_name || ""}`,
        shop: t.shop_name || "Unknown Shop",
        createdAt: t.created_at,
      })),
    });
  } catch (error) {
    console.error("❌ [TicketVerification-TEST] Error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during ticket listing",
    });
  }
});

/**
 * Test verification endpoint (no auth required)
 * GET /api/tickets/verify-test/:ticketNumber
 */
router.get("/verify-test/:ticketNumber", async (req, res) => {
  const startTime = Date.now();
  console.log(
    `🎫 [TicketVerification-TEST] Starting TEST verification request at ${new Date().toISOString()}`
  );

  try {
    const { ticketNumber } = req.params;
    console.log(
      `🎫 [TicketVerification-TEST] Requested ticket number: "${ticketNumber}"`
    );

    // Skip authentication and role check for testing
    console.log(`🔍 [TicketVerification-TEST] Skipping auth for test endpoint`);

    // Validate ticket number format
    if (!validateTicketNumber(ticketNumber)) {
      console.log(
        `❌ [TicketVerification-TEST] Invalid ticket number format: "${ticketNumber}"`
      );
      return res.status(400).json({
        success: false,
        error: "Invalid ticket number format",
        ticketNumber,
      });
    }

    console.log(
      `✅ [TicketVerification-TEST] Ticket number format is valid: "${ticketNumber}"`
    );

    // Query the database for ticket information
    console.log(`🔍 [TicketVerification-TEST] Querying database for ticket...`);
    const ticketQuery = `
      SELECT 
        ct.*,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        s.name as shop_name,
        s.address as shop_address,
        pd.date as event_date,
        pd.name as day_name
      FROM customer_tickets ct
      LEFT JOIN checkout_customers c ON ct.checkout_customer_id = c.id
      LEFT JOIN shops s ON ct.shop_id = s.shop_id
      LEFT JOIN procession_days pd ON ct.day_id = pd.day_id
      WHERE ct.ticket_no = ?
    `;

    const ticketResults = await query(ticketQuery, [ticketNumber]);

    if (ticketResults.length === 0) {
      console.log(
        `❌ [TicketVerification-TEST] Ticket not found: "${ticketNumber}"`
      );
      return res.status(404).json({
        success: false,
        error: "Ticket not found or inactive",
        ticketNumber,
      });
    }

    const ticket = ticketResults[0];
    console.log(
      `✅ [TicketVerification-TEST] Ticket found in database for: ${ticket.first_name} ${ticket.last_name}`
    );

    // Get seat type details
    let seatTypeDetails = [];

    if (ticket.booking_id) {
      console.log(
        `🔍 [TicketVerification-TEST] Getting seat types for booking_id: ${ticket.booking_id}`
      );
      const seatTypesResult = await query(
        `
        SELECT 
          b.booking_id,
          b.quantity,
          b.total_price,
          st.name as seat_type_name,
          st.description as seat_type_description,
          sta.price as price_per_seat
        FROM bookings b
        JOIN seat_types st ON b.seat_type_id = st.seat_type_id
        LEFT JOIN seat_type_availability sta ON b.seat_type_id = sta.seat_type_id AND b.day_id = sta.day_id
        WHERE b.booking_id = ?
        `,
        [ticket.booking_id]
      );

      seatTypeDetails = seatTypesResult.map((seat) => ({
        seatType: seat.seat_type_name,
        description: seat.seat_type_description,
        quantity: seat.quantity,
        pricePerSeat: parseFloat(seat.price_per_seat || 0),
        subtotal: parseFloat(seat.total_price || 0),
      }));

      console.log(
        `✅ [TicketVerification-TEST] Found ${seatTypeDetails.length} seat type(s) for booking`
      );
    } else {
      console.log(
        `⚠️ [TicketVerification-TEST] No booking_id found, checking legacy booking_info...`
      );

      // Fallback to legacy booking_info JSON field
      const bookingInfo = safeJsonParse(ticket.booking_info);
      if (bookingInfo && bookingInfo.bookings) {
        seatTypeDetails = bookingInfo.bookings.map((booking) => ({
          seatType: booking.seat_type || booking.seatTypeName || "Unknown",
          description: booking.seat_description || booking.description || "",
          quantity: booking.quantity || 0,
          pricePerSeat:
            parseFloat(booking.price_per_seat || booking.amount || 0) /
            (booking.quantity || 1),
          subtotal: parseFloat(booking.amount || booking.total_amount || 0),
        }));
        console.log(
          `✅ [TicketVerification-TEST] Found ${seatTypeDetails.length} seat type(s) from legacy booking_info`
        );
      } else {
        console.log(
          `⚠️ [TicketVerification-TEST] No seat type details found in booking_info`
        );
      }
    }

    const parsedTicketNumber = parseTicketNumber(ticketNumber);
    console.log(
      `🔧 [TicketVerification-TEST] Parsed ticket number:`,
      parsedTicketNumber
    );

    // Parse JSON fields safely for backward compatibility
    console.log(`🔧 [TicketVerification-TEST] Parsing legacy JSON fields...`);
    const customerInfo = safeJsonParse(ticket.customer_info);
    const bookingInfo = safeJsonParse(ticket.booking_info);

    // Build comprehensive response
    const responseData = {
      success: true,
      ticket: {
        // Core ticket identification
        ticketNumber: ticket.ticket_no,
        ticketId: ticket.ticket_id,

        // Customer information
        customerInfo: {
          firstName:
            ticket.first_name ||
            customerInfo?.firstName ||
            customerInfo?.first_name,
          lastName:
            ticket.last_name ||
            customerInfo?.lastName ||
            customerInfo?.last_name,
          email: ticket.email || customerInfo?.email,
          phone: ticket.phone || customerInfo?.phone,
        },

        // Shop information
        shopInfo: {
          id: ticket.shop_id,
          name: ticket.shop_name,
          address: ticket.shop_address,
        },

        // Event information
        eventInfo: {
          name: ticket.day_name || "Kandy Esala Perahera",
          date: formatDateString(ticket.event_date),
          dayId: ticket.day_id,
        },

        // Seat types and quantities
        seatTypes: seatTypeDetails,

        // Payment information
        paymentInfo: {
          orderId: ticket.payhere_order_id,
          paymentId: ticket.payhere_payment_id,
          totalAmount: parseFloat(ticket.total_amount || 0),
        },

        // Status and metadata
        status: ticket.status,

        // Legacy fields for backward compatibility
        bookingInfo: bookingInfo,

        // Ticket metadata
        issuedDate: ticket.created_at,
        lastUpdated: ticket.updated_at,
        parsedTicketNumber,
      },
    };

    const processingTime = Date.now() - startTime;
    console.log(
      `✅ [TicketVerification-TEST] Verification completed successfully in ${processingTime}ms`
    );
    console.log(
      `📊 [TicketVerification-TEST] Response includes: ${seatTypeDetails.length} seat type(s), shop: ${responseData.ticket.shopInfo.name}, event: ${responseData.ticket.eventInfo.name}`
    );

    // Return enhanced ticket verification data
    res.json(responseData);
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(
      `💥 [TicketVerification-TEST] Error after ${processingTime}ms:`,
      error
    );
    console.error(`📊 [TicketVerification-TEST] Error stack:`, error.stack);

    res.status(500).json({
      success: false,
      error: "Internal server error during ticket verification",
    });
  }
});

/**
 * Update ticket usage status - Seller only endpoint
 * POST /api/tickets/use
 */
router.post("/use", verifyFirebaseToken, async (req, res) => {
  const startTime = Date.now();
  console.log(
    `🎫 [TicketUsage] Starting ticket usage update request at ${new Date().toISOString()}`
  );

  try {
    const { ticketNumber } = req.body;
    console.log(`🎫 [TicketUsage] Requested ticket number: "${ticketNumber}"`);
    console.log(
      `👤 [TicketUsage] User: ${req.user?.uid || "unknown"}, Role: ${
        req.user?.role || "unknown"
      }`
    );

    // Check if user is a seller
    if (req.user.role !== "seller") {
      console.log(
        `❌ [TicketUsage] Access denied - user role: ${req.user.role}`
      );
      return res.status(403).json({
        success: false,
        message: "Access denied. This endpoint is only available to sellers.",
      });
    }
    console.log(`✅ [TicketUsage] Seller access confirmed`);

    // Validate request body
    if (
      !ticketNumber ||
      typeof ticketNumber !== "string" ||
      ticketNumber.trim() === ""
    ) {
      console.log(`❌ [TicketUsage] Invalid ticket number provided`);
      return res.status(400).json({
        success: false,
        message: "Valid ticket number is required",
      });
    }

    const trimmedTicketNumber = ticketNumber.trim();
    console.log(`🎫 [TicketUsage] Processing ticket: "${trimmedTicketNumber}"`);

    // Validate ticket number format
    console.log(`🔍 [TicketUsage] Validating ticket number format...`);
    if (!validateTicketNumber(trimmedTicketNumber)) {
      console.log(
        `❌ [TicketUsage] Invalid ticket number format: "${trimmedTicketNumber}"`
      );
      return res.status(400).json({
        success: false,
        message: "Invalid ticket number format",
      });
    }
    console.log(`✅ [TicketUsage] Ticket number format is valid`);

    // Check if ticket exists and get current status
    console.log(
      `🗄️ [TicketUsage] Checking ticket existence and current status...`
    );
    const ticketResult = await query(
      `SELECT ticket_id, ticket_no, used FROM customer_tickets WHERE ticket_no = ?`,
      [trimmedTicketNumber]
    );

    if (ticketResult.length === 0) {
      console.log(`❌ [TicketUsage] Ticket not found in database`);
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const ticket = ticketResult[0];
    const currentUsedStatus = ticket.used || "no";
    console.log(
      `📊 [TicketUsage] Current usage status: "${currentUsedStatus}"`
    );

    // Check if ticket is already used
    if (currentUsedStatus === "yes") {
      console.log(`⚠️ [TicketUsage] Ticket already marked as used`);
      return res.status(400).json({
        success: false,
        message: "Ticket has already been used",
      });
    }

    // Update ticket status to 'used'
    console.log(`🔄 [TicketUsage] Updating ticket status to 'used'...`);
    const updateResult = await query(
      `UPDATE customer_tickets SET used = 'yes', updated_at = CURRENT_TIMESTAMP WHERE ticket_no = ?`,
      [trimmedTicketNumber]
    );

    if (updateResult.affectedRows === 0) {
      console.log(
        `❌ [TicketUsage] Failed to update ticket - no rows affected`
      );
      return res.status(500).json({
        success: false,
        message: "Failed to update ticket status",
      });
    }

    console.log(`✅ [TicketUsage] Ticket status updated successfully`);

    const processingTime = Date.now() - startTime;
    console.log(
      `✅ [TicketUsage] Usage update completed successfully in ${processingTime}ms`
    );

    // Return success response
    res.json({
      success: true,
      message: "Ticket marked as used successfully",
      ticketNumber: trimmedTicketNumber,
      previousStatus: currentUsedStatus,
      newStatus: "yes",
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`💥 [TicketUsage] Error after ${processingTime}ms:`, error);
    console.error(`📊 [TicketUsage] Error stack:`, error.stack);

    res.status(500).json({
      success: false,
      message: "Internal server error during ticket usage update",
    });
  }
});

module.exports = router;
