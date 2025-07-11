// controllers/customerTicketsController.js
const { query } = require("../config/database-schema");
const pdfService = require("../services/pdfService");
const emailService = require("../services/emailService");
const { generateTicketNumber } = require("../utils/ticketNumberGenerator");

/**
 * Helper function to format date as YYYY-MM-DD string (same as in seatTypeController.js)
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
 * Helper to log user activity in the activity_logs table
 */
const logActivity = async (
  userId,
  role,
  actionType,
  description,
  affectedEntityId = null,
  entityType = null
) => {
  try {
    if (!userId) {
      console.log(
        `⚠️ Skipping activity log - no user ID provided for action: ${actionType}`
      );
      return;
    }

    const userExists = await query(
      "SELECT user_id FROM users WHERE user_id = ?",
      [userId]
    );

    if (userExists.length === 0) {
      console.log(
        `⚠️ Skipping activity log - user_id ${userId} does not exist in users table`
      );
      return;
    }

    await query(
      `INSERT INTO activity_logs 
       (user_id, role, action_type, description, affected_entity_id, entity_type) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, role, actionType, description, affectedEntityId, entityType]
    );

    console.log(`✅ Activity logged for user ${userId}: ${actionType}`);
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

/**
 * Create customer ticket after successful payment
 */
exports.createCustomerTicket = async (paymentData) => {
  try {
    const {
      customerId,
      payherePaymentId,
      payhereOrderId,
      customerInfo,
      seatDetails,
      paymentDetails,
      bookingDetails,
    } = paymentData;

    console.log("🎫 Creating customer ticket:", {
      customerId,
      payherePaymentId,
      payhereOrderId,
      customerEmail: customerInfo?.email,
    });

    // Note: customerId parameter should now be user_id (since account_owner_id links to users.user_id)
    console.log(
      `📝 Using customerId ${customerId} as account_owner_id (user_id)`
    );

    // Step 1: Get checkout customer ID for this order
    const {
      getCheckoutCustomerByOrderId,
    } = require("./checkoutCustomerController");
    const checkoutCustomer = await getCheckoutCustomerByOrderId(payhereOrderId);

    if (!checkoutCustomer) {
      throw new Error(
        `No checkout customer found for order: ${payhereOrderId}`
      );
    }

    // Step 2: Extract shop_id, booking_id, and day_id from payments and bookings
    console.log(`🔍 Extracting booking details for order: ${payhereOrderId}`);

    const extractedBookingDetails = await query(
      `SELECT DISTINCT b.booking_id, b.shop_id, b.day_id, p.payment_id
       FROM payments p
       INNER JOIN bookings b ON p.booking_id = b.booking_id
       WHERE p.payhere_order_id = ?`,
      [payhereOrderId]
    );

    console.log(`📋 Found booking details:`, extractedBookingDetails);

    let shopId = null,
      bookingId = null,
      dayId = null;

    if (extractedBookingDetails.length > 0) {
      // For multi-item orders, we'll use the first booking's details
      // In the future, this could be enhanced to handle multi-shop orders differently
      const firstBooking = extractedBookingDetails[0];
      shopId = firstBooking.shop_id;
      bookingId = firstBooking.booking_id;
      dayId = firstBooking.day_id;

      console.log(
        `✅ Using booking details: shop_id=${shopId}, booking_id=${bookingId}, day_id=${dayId}`
      );

      // If multiple different shops/days in one order, log this case
      const uniqueShops = [
        ...new Set(extractedBookingDetails.map((b) => b.shop_id)),
      ];
      const uniqueDays = [
        ...new Set(extractedBookingDetails.map((b) => b.day_id)),
      ];

      if (uniqueShops.length > 1 || uniqueDays.length > 1) {
        console.log(
          `⚠️ Multi-shop/multi-day order detected. Using first booking details.`
        );
        console.log(`   Shops in order: ${uniqueShops.join(", ")}`);
        console.log(`   Days in order: ${uniqueDays.join(", ")}`);
        // For multi-shop orders, we keep shop_id, booking_id, day_id as NULL
        // to indicate this ticket spans multiple entities
        shopId = null;
        bookingId = null;
        dayId = null;
      }
    } else {
      console.log(`⚠️ No booking details found for order: ${payhereOrderId}`);
    }

    // Step 3: Insert initial ticket record to get ticket_id for ticket number generation
    const initialTicketResult = await query(
      `INSERT INTO customer_tickets 
       (account_owner_id, checkout_customer_id, payhere_payment_id, payhere_order_id, shop_id, booking_id, day_id, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        customerId,
        checkoutCustomer.id,
        payherePaymentId,
        payhereOrderId,
        shopId,
        bookingId,
        dayId,
      ]
    );

    const ticketId = initialTicketResult.insertId;
    console.log(`✅ Initial ticket record created with ID: ${ticketId}`);

    // Step 4: Generate unique ticket number
    const ticketNumber = generateTicketNumber(ticketId);
    console.log(`🎫 Generated ticket number: ${ticketNumber}`);

    // Step 5: Generate PDF ticket with ticket number and QR code
    const pdfResult = await pdfService.generateTicketPDF({
      customerInfo,
      seatDetails,
      paymentDetails,
      payhereOrderId,
      payherePaymentId,
      bookingDetails,
      ticketNumber, // Include ticket number for PDF generation
    });

    if (!pdfResult.success) {
      throw new Error("Failed to generate PDF ticket");
    }

    // Step 6: Update ticket record with ticket number, PDF URL, and QR code URL
    await query(
      `UPDATE customer_tickets 
       SET ticket_no = ?, ticket_url = ?, qrcode_url = ?, updated_at = NOW()
       WHERE ticket_id = ?`,
      [ticketNumber, pdfResult.filePath, pdfResult.qrCodeFilePath, ticketId]
    );
    console.log("✅ Customer ticket record updated:", {
      ticketId,
      ticketNumber,
      pdfPath: pdfResult.filePath,
      qrCodePath: pdfResult.qrCodeFilePath,
    });

    // Step 7: Send email with PDF attachment
    const emailResult = await emailService.sendTicketEmail({
      email: customerInfo.email,
      firstName: customerInfo.firstName,
      lastName: customerInfo.lastName,
      ticketUrl: pdfResult.filePath,
      payherePaymentId,
      payhereOrderId,
      seatDetails,
      paymentDetails,
      ticketNumber, // Include ticket number in email
    });

    if (emailResult.success) {
      console.log("✅ Ticket email sent successfully:", {
        messageId: emailResult.messageId,
        recipient: emailResult.recipient,
        ticketNumber,
      });
    } // Step 8: Log activity
    const customerData = await query(
      "SELECT user_id FROM customers WHERE customer_id = ?",
      [customerId]
    );

    if (customerData.length > 0) {
      await logActivity(
        customerData[0].user_id,
        "customer",
        "ticket_generated",
        `Ticket ${ticketNumber} generated and emailed for order ${payhereOrderId}`,
        ticketId,
        "customer_ticket"
      );
    }

    return {
      success: true,
      ticketId,
      ticketNumber,
      ticketUrl: pdfResult.filePath,
      emailSent: emailResult.success,
      messageId: emailResult.messageId,
    };
  } catch (error) {
    console.error("❌ Failed to create customer ticket:", error);
    throw new Error(`Ticket creation failed: ${error.message}`);
  }
};

/**
 * Get customer ticket by ID
 */
exports.getCustomerTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { user } = req;
    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: "Ticket ID is required",
      });
    }

    // Get ticket details with checkout customer information and related entities
    const tickets = await query(
      `SELECT ct.*, cc.first_name, cc.last_name, cc.email, cc.phone,
              s.name as shop_name, s.street as shop_location,
              b.status as booking_status, b.quantity as booking_quantity, b.total_price as booking_total,
              pd.event_name as day_name, pd.date as procession_date
       FROM customer_tickets ct
       LEFT JOIN checkout_customers cc ON ct.checkout_customer_id = cc.id
       LEFT JOIN shops s ON ct.shop_id = s.shop_id
       LEFT JOIN bookings b ON ct.booking_id = b.booking_id
       LEFT JOIN procession_days pd ON ct.day_id = pd.day_id
       WHERE ct.ticket_id = ?`,
      [ticketId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const ticket = tickets[0];

    // Check permissions - only ticket owner or admin can view
    if (
      user.role !== "admin" &&
      user.role !== "super_admin" &&
      user.id !== ticket.user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Remove sensitive fields for non-admin users
    if (user.role !== "admin" && user.role !== "super_admin") {
      delete ticket.user_id;
    }

    res.json({
      success: true,
      ticket,
    });
  } catch (error) {
    console.error("Error fetching customer ticket:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get customer tickets by customer ID
 */
exports.getCustomerTickets = async (req, res) => {
  try {
    const { user } = req;
    const { customerId } = req.params;

    console.log(`🎫 [CustomerTickets] Getting tickets for user:`, {
      userId: user.id,
      role: user.role,
      requestedCustomerId: customerId,
    });

    // For any user role, use their user_id as account_owner_id
    let targetUserId = user.id;

    // If a specific customerId is requested and user is admin, get that customer's user_id
    if (customerId && (user.role === "admin" || user.role === "super_admin")) {
      const customerData = await query(
        "SELECT user_id FROM customers WHERE customer_id = ?",
        [customerId]
      );

      if (customerData.length === 0) {
        console.log(`❌ [CustomerTickets] Customer ${customerId} not found`);
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      targetUserId = customerData[0].user_id;
      console.log(
        `🔍 [CustomerTickets] Admin requesting tickets for user_id: ${targetUserId}`
      );
    }

    // Get tickets with checkout customer details and related entities
    console.log(
      `📋 [CustomerTickets] Querying tickets for account_owner_id: ${targetUserId}`
    );

    const tickets = await query(
      `SELECT ct.ticket_id, ct.payhere_payment_id, ct.payhere_order_id, ct.ticket_no,
              cc.first_name, cc.last_name, cc.email, cc.phone, cc.country, 
              ct.created_at, ct.updated_at, ct.ticket_url, ct.qrcode_url,
              s.name as shop_name, s.street as shop_location,
              pd.event_name as day_name, pd.date as procession_date
       FROM customer_tickets ct
       LEFT JOIN checkout_customers cc ON ct.checkout_customer_id = cc.id
       LEFT JOIN shops s ON ct.shop_id = s.shop_id
       LEFT JOIN procession_days pd ON ct.day_id = pd.day_id
       WHERE ct.account_owner_id = ?
       ORDER BY ct.created_at DESC`,
      [targetUserId]
    );

    console.log(
      `✅ [CustomerTickets] Found ${tickets.length} tickets for user ${targetUserId}`
    );

    // Format event dates before sending response
    console.log("🗓️ [CustomerTickets] Formatting event dates...");
    const formattedTickets = tickets.map((ticket) => {
      const formattedTicket = { ...ticket };

      // Format procession_date field (main event date)
      if (ticket.procession_date) {
        const originalDate = ticket.procession_date;
        const formattedDate = formatDateString(ticket.procession_date);
        formattedTicket.procession_date = formattedDate;
        console.log(
          `📅 [CustomerTickets] Formatted procession_date: ${originalDate} → ${formattedDate}`
        );
      }

      // Format created_at and updated_at if needed (keeping them as-is for now since they include time)
      // These are typically datetime fields and may be needed with time information

      return formattedTicket;
    });

    console.log(
      `✅ [CustomerTickets] Date formatting completed for ${formattedTickets.length} tickets`
    );

    res.json({
      success: true,
      tickets: formattedTickets,
      count: formattedTickets.length,
    });
  } catch (error) {
    console.error(
      "❌ [CustomerTickets] Error fetching customer tickets:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get all customer tickets (admin only)
 */
exports.getAllCustomerTickets = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "";
    let queryParams = [];

    if (search) {
      whereClause = `WHERE ct.first_name LIKE ? OR ct.last_name LIKE ? OR 
                     ct.email LIKE ? OR ct.payhere_order_id LIKE ?`;
      const searchTerm = `%${search}%`;
      queryParams = [searchTerm, searchTerm, searchTerm, searchTerm];
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM customer_tickets ct
      ${whereClause}
    `;

    const countResult = await query(countQuery, queryParams);
    const total = countResult[0].total; // Get tickets with checkout customer details and related entities
    const ticketsQuery = `
      SELECT ct.*, cc.first_name, cc.last_name, cc.email, cc.phone, cc.country,
             s.name as shop_name, s.street as shop_location,
             pd.event_name as day_name, pd.date as procession_date
      FROM customer_tickets ct
      LEFT JOIN checkout_customers cc ON ct.checkout_customer_id = cc.id
      LEFT JOIN shops s ON ct.shop_id = s.shop_id
      LEFT JOIN procession_days pd ON ct.day_id = pd.day_id
      ${whereClause}
      ORDER BY ct.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const tickets = await query(ticketsQuery, [
      ...queryParams,
      parseInt(limit),
      offset,
    ]);

    res.json({
      success: true,
      tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching all customer tickets:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Resend ticket email
 */
exports.resendTicketEmail = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { user } = req; // Get ticket details with checkout customer information and related entities
    const tickets = await query(
      `SELECT ct.*, cc.first_name, cc.last_name, cc.email, cc.phone,
              s.name as shop_name, s.street as shop_location,
              pd.event_name as day_name, pd.date as procession_date
       FROM customer_tickets ct
       LEFT JOIN checkout_customers cc ON ct.checkout_customer_id = cc.id
       LEFT JOIN shops s ON ct.shop_id = s.shop_id
       LEFT JOIN procession_days pd ON ct.day_id = pd.day_id
       WHERE ct.ticket_id = ?`,
      [ticketId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }
    const ticket = tickets[0];

    // Check permissions - verify if user owns this ticket through account_owner_id
    let hasPermission = user.role === "admin" || user.role === "super_admin";

    if (!hasPermission && ticket.account_owner_id) {
      // Check if current user is the account owner (account_owner_id now links to users.user_id)
      hasPermission = user.id === ticket.account_owner_id;
      console.log(
        `🔍 Permission check: user ${user.id} === account_owner ${ticket.account_owner_id} = ${hasPermission}`
      );
    }

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Resend email
    const emailResult = await emailService.sendTicketEmail({
      email: ticket.email,
      firstName: ticket.first_name,
      lastName: ticket.last_name,
      ticketUrl: ticket.ticket_url,
      payherePaymentId: ticket.payhere_payment_id,
      payhereOrderId: ticket.payhere_order_id,
      seatDetails: null, // Could be enhanced to include seat details
      paymentDetails: null, // Could be enhanced to include payment details
    });

    if (emailResult.success) {
      // Log activity
      await logActivity(
        user.id,
        user.role,
        "ticket_email_resent",
        `Ticket email resent for order ${ticket.payhere_order_id}`,
        ticketId,
        "customer_ticket"
      );

      res.json({
        success: true,
        message: "Ticket email sent successfully",
        messageId: emailResult.messageId,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to send ticket email",
      });
    }
  } catch (error) {
    console.error("Error resending ticket email:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get detailed ticket information by user ID and ticket number
 * Includes all related data: shop, event, seat types, bookings, customer info
 */
exports.getTicketDetailsByUserAndNumber = async (req, res) => {
  try {
    const { userId, ticketNumber } = req.params;
    const { user } = req;

    console.log("=".repeat(80));
    console.log("🎫 FETCHING DETAILED TICKET INFORMATION");
    console.log(`👤 User ID: ${userId}`);
    console.log(`🎫 Ticket Number: ${ticketNumber}`);
    console.log(`🔐 Requesting User: ${user.id} (${user.role})`);
    console.log("=".repeat(80));

    if (!userId || !ticketNumber) {
      console.log("❌ Missing required parameters");
      return res.status(400).json({
        success: false,
        message: "User ID and ticket number are required",
      });
    }

    // Check permissions - any authenticated user can view tickets, but we'll log the access
    // Note: According to requirements, any user role (customer, seller, admin, super_admin) can access this page
    console.log("🔍 Permission check:");
    console.log(`   - Requesting user Firebase UID: ${user.firebaseUid}`);
    console.log(`   - Requesting user role: ${user.role}`);
    console.log(`   - Target user Firebase UID: ${userId}`);
    console.log(`   - Access granted for role: ${user.role}`);

    console.log("🔍 Querying comprehensive ticket details...");

    // Get comprehensive ticket details with all related information
    const ticketQuery = `
      SELECT 
        ct.ticket_id,
        ct.ticket_no,
        ct.created_at as booked_date,
        ct.updated_at,
        ct.ticket_url,
        ct.qrcode_url,
        ct.payhere_payment_id,
        ct.payhere_order_id,
        
        -- Shop information
        s.shop_id,
        s.name as shop_name,
        s.street as shop_address,
        s.latitude as shop_latitude,
        s.longitude as shop_longitude,
        
        -- Event information
        pd.day_id,
        pd.event_name,
        pd.date as event_date,
        pd.color as event_color,
        
        -- Customer information from checkout
        cc.first_name,
        cc.last_name,
        cc.phone as contact_no,
        cc.email
        
      FROM customer_tickets ct
      LEFT JOIN shops s ON ct.shop_id = s.shop_id
      LEFT JOIN procession_days pd ON ct.day_id = pd.day_id
      LEFT JOIN checkout_customers cc ON ct.checkout_customer_id = cc.id
      LEFT JOIN users u ON ct.account_owner_id = u.user_id
      WHERE u.firebase_uid = ? AND ct.ticket_no = ?
    `;

    const ticketResults = await query(ticketQuery, [userId, ticketNumber]);

    if (ticketResults.length === 0) {
      console.log(
        `❌ No ticket found for user ${userId} with ticket number ${ticketNumber}`
      );
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const ticketData = ticketResults[0];
    console.log("✅ Base ticket data retrieved:", {
      ticketId: ticketData.ticket_id,
      shopName: ticketData.shop_name,
      eventName: ticketData.event_name,
      eventDate: ticketData.event_date,
    });

    // Get booking details for seat types specific to this ticket's shop and event date
    console.log(
      "🔍 Fetching seat types and booking details for this specific shop and event date..."
    );

    // Better approach: Query bookings directly through the payment order ID
    // This avoids duplicates caused by multiple customer_tickets records with same ticket_no
    const bookingQuery = `
      SELECT 
        b.booking_id,
        b.quantity,
        b.total_price as subtotal,
        st.name as seat_type_name,
        s.name as shop_name,
        pd.event_name
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN shops s ON st.shop_id = s.shop_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      WHERE p.payhere_order_id = ?
        AND st.shop_id = ?
        AND b.day_id = ?
      ORDER BY st.name
    `;

    const bookingResults = await query(bookingQuery, [
      ticketData.payhere_order_id,
      ticketData.shop_id,
      ticketData.day_id,
    ]);

    console.log(`🔍 Booking query parameters (updated approach):`);
    console.log(`   - Order ID: ${ticketData.payhere_order_id}`);
    console.log(
      `   - Shop ID: ${ticketData.shop_id} (${ticketData.shop_name})`
    );
    console.log(`   - Day ID: ${ticketData.day_id} (${ticketData.event_name})`);
    console.log(
      `✅ Found ${bookingResults.length} unique booking details for this specific shop and event date`
    );

    if (bookingResults.length === 0) {
      console.log(
        "⚠️ No booking details found for this specific shop and event date"
      );
    } else {
      console.log("📋 Unique booking details found:");
      bookingResults.forEach((booking, index) => {
        console.log(
          `   ${index + 1}. Booking ID: ${booking.booking_id} | ${
            booking.seat_type_name
          }: ${booking.quantity} seats, LKR ${parseFloat(
            booking.subtotal
          ).toFixed(2)}`
        );
      });

      // Check for duplicates in seat types (should not happen now)
      const seatTypes = bookingResults.map((b) => b.seat_type_name);
      const uniqueSeatTypes = [...new Set(seatTypes)];
      if (seatTypes.length !== uniqueSeatTypes.length) {
        console.log("⚠️ WARNING: Duplicate seat types detected!");
        console.log(`   - Total results: ${seatTypes.length}`);
        console.log(`   - Unique seat types: ${uniqueSeatTypes.length}`);
        console.log(
          `   - Duplicates: ${seatTypes.filter(
            (type, index) => seatTypes.indexOf(type) !== index
          )}`
        );
      } else {
        console.log(
          `✅ All ${seatTypes.length} seat types are unique - no duplicates`
        );
      }
    }

    // Format the response data
    const responseData = {
      success: true,
      ticket: {
        // Basic ticket information
        ticketNumber: ticketData.ticket_no,
        ticketId: ticketData.ticket_id,
        bookedDate: new Date(ticketData.booked_date).toLocaleDateString(
          "en-GB",
          {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }
        ),

        // Customer information
        customerName:
          `${ticketData.first_name || ""} ${
            ticketData.last_name || ""
          }`.trim() || "N/A",
        contactNo: ticketData.contact_no || "N/A",
        email: ticketData.email || "N/A",

        // Event information
        eventName: ticketData.event_name || "Kandy Esala Perahera",
        eventDate: ticketData.event_date
          ? new Date(ticketData.event_date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })
          : "TBD",
        eventColor: ticketData.event_color || "#FF6B35", // Default orange color

        // Location information
        location: ticketData.shop_name || "N/A",
        shopAddress: ticketData.shop_address || "N/A",
        shopLatitude: ticketData.shop_latitude || null,
        shopLongitude: ticketData.shop_longitude || null,

        // QR code and ticket file
        qrCodeUrl: ticketData.qrcode_url || null,
        ticketUrl: ticketData.ticket_url || null,

        // Booking details (seat types, quantities, subtotals)
        bookingDetails: bookingResults.map((booking) => ({
          seatType: booking.seat_type_name,
          quantity: booking.quantity,
          subtotal: `LKR ${parseFloat(booking.subtotal).toFixed(2)}`,
        })),

        // Payment information
        paymentId: ticketData.payhere_payment_id,
        orderId: ticketData.payhere_order_id,
      },
    };

    console.log("📊 RESPONSE DATA SUMMARY:");
    console.log(`   🎫 Ticket: ${responseData.ticket.ticketNumber}`);
    console.log(`   👤 Customer: ${responseData.ticket.customerName}`);
    console.log(`   📍 Location: ${responseData.ticket.location}`);
    console.log(
      `   📅 Event: ${responseData.ticket.eventName} on ${responseData.ticket.eventDate}`
    );
    console.log(`   🎨 Color: ${responseData.ticket.eventColor}`);
    console.log(
      `   📋 Bookings: ${responseData.ticket.bookingDetails.length} seat types`
    );
    console.log(`   📱 Contact: ${responseData.ticket.contactNo}`);
    console.log(
      `   🗺️ Coordinates: ${responseData.ticket.shopLatitude}, ${responseData.ticket.shopLongitude}`
    );
    console.log("=".repeat(80));

    res.json(responseData);
  } catch (error) {
    console.error("=".repeat(80));
    console.error("❌ ERROR FETCHING TICKET DETAILS");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    console.error("=".repeat(80));

    res.status(500).json({
      success: false,
      message: "Internal server error while fetching ticket details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get customer tickets grouped by ticket_no (shows only unique ticket numbers)
 * This endpoint returns one record per unique ticket_no to avoid showing duplicate cards
 */
exports.getUniqueCustomerTickets = async (req, res) => {
  try {
    const { user } = req;
    const { customerId } = req.params;

    console.log(`🎫 [CustomerTickets] Getting unique tickets for user:`, {
      userId: user.id,
      role: user.role,
      requestedCustomerId: customerId,
    });

    // For any user role, use their user_id as account_owner_id
    let targetUserId = user.id;

    // If a specific customerId is requested and user is admin, get that customer's user_id
    if (customerId && (user.role === "admin" || user.role === "super_admin")) {
      const customerData = await query(
        "SELECT user_id FROM customers WHERE customer_id = ?",
        [customerId]
      );

      if (customerData.length === 0) {
        console.log(`❌ [CustomerTickets] Customer ${customerId} not found`);
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      targetUserId = customerData[0].user_id;
      console.log(
        `🔍 [CustomerTickets] Admin requesting unique tickets for user_id: ${targetUserId}`
      );
    }

    // Get tickets grouped by ticket_no to avoid duplicates
    // Use MIN(ticket_id) to get the first record for each ticket_no group
    console.log(
      `📋 [CustomerTickets] Querying unique tickets for account_owner_id: ${targetUserId}`
    );

    const tickets = await query(
      `SELECT ct.ticket_id, ct.payhere_payment_id, ct.payhere_order_id, ct.ticket_no,
              cc.first_name, cc.last_name, cc.email, cc.phone, cc.country, 
              ct.created_at, ct.updated_at, ct.ticket_url, ct.qrcode_url,
              s.name as shop_name, s.street as shop_location,
              pd.event_name as day_name, pd.date as procession_date,
              COUNT(*) as total_records_for_ticket
       FROM customer_tickets ct
       LEFT JOIN checkout_customers cc ON ct.checkout_customer_id = cc.id
       LEFT JOIN shops s ON ct.shop_id = s.shop_id
       LEFT JOIN procession_days pd ON ct.day_id = pd.day_id
       WHERE ct.account_owner_id = ? AND ct.ticket_no IS NOT NULL
       GROUP BY ct.ticket_no
       HAVING MIN(ct.ticket_id) = ct.ticket_id
       ORDER BY ct.created_at DESC`,
      [targetUserId]
    );

    console.log(
      `✅ [CustomerTickets] Found ${tickets.length} unique tickets for user ${targetUserId}`
    );

    // Log the grouping information
    tickets.forEach((ticket) => {
      if (ticket.total_records_for_ticket > 1) {
        console.log(
          `🔗 [CustomerTickets] Ticket ${ticket.ticket_no} represents ${ticket.total_records_for_ticket} booking records`
        );
      }
    });

    // Format event dates before sending response
    console.log(
      "🗓️ [CustomerTickets] Formatting event dates for unique tickets..."
    );
    const formattedTickets = tickets.map((ticket) => {
      const formattedTicket = { ...ticket };

      // Format procession_date field (main event date)
      if (ticket.procession_date) {
        const originalDate = ticket.procession_date;
        const formattedDate = formatDateString(ticket.procession_date);
        formattedTicket.procession_date = formattedDate;
        console.log(
          `📅 [CustomerTickets] Formatted unique ticket procession_date: ${originalDate} → ${formattedDate}`
        );
      }

      return formattedTicket;
    });

    console.log(
      `✅ [CustomerTickets] Date formatting completed for ${formattedTickets.length} unique tickets`
    );

    // Log activity
    await logActivity(
      user.id,
      user.role,
      "VIEW_UNIQUE_TICKETS",
      `User viewed ${tickets.length} unique tickets`,
      null,
      "customer_tickets"
    );

    res.json({
      success: true,
      tickets: formattedTickets,
      count: formattedTickets.length,
      note: "Grouped by ticket_no to show unique tickets only",
    });
  } catch (error) {
    console.error(
      "❌ [CustomerTickets] Error fetching unique customer tickets:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  createCustomerTicket: exports.createCustomerTicket,
  getCustomerTicketById: exports.getCustomerTicketById,
  getCustomerTickets: exports.getCustomerTickets,
  getAllCustomerTickets: exports.getAllCustomerTickets,
  resendTicketEmail: exports.resendTicketEmail,
  getTicketDetailsByUserAndNumber: exports.getTicketDetailsByUserAndNumber,
  getUniqueCustomerTickets: exports.getUniqueCustomerTickets,
};
