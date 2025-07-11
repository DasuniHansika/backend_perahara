// services/multiShopTicketService.js - Enhanced version with proper booking handling
const multiShopPdfService = require("./multiShopPdfService");
const multiShopEmailService = require("./multiShopEmailService");
const { query } = require("../config/database-schema");
const {
  generateTicketNumber,
  generateSharedTicketNumber,
} = require("../utils/ticketNumberGenerator");
const {
  getCheckoutCustomerByOrderId,
} = require("../controllers/checkoutCustomerController");

class MultiShopTicketService {
  /**
   * Process multi-shop tickets for successful payment
   * Groups bookings by shop and event date, generates one PDF per group with separate DB records
   */
  async processMultiShopTickets(
    payhereOrderId,
    payherePaymentId,
    customerInfo,
    paymentMethod = null
  ) {
    try {
      console.log(
        `🎫 Starting enhanced multi-shop ticket processing for order: ${payhereOrderId}`
      );
      console.log(
        `📝 Processing customer: ${customerInfo.firstName} ${customerInfo.lastName} (${customerInfo.email})`
      );
      console.log(
        `💳 Payment method: ${paymentMethod || "PayHere (fallback)"}`
      );

      // Get all payments and bookings for this order
      const paymentsQuery = `
        SELECT 
          p.payment_id,
          p.booking_id,
          p.amount,
          b.customer_id,
          b.shop_id,
          b.seat_type_id,
          b.day_id,
          b.quantity,
          b.total_price,
          s.name as shop_name,
          s.street as shop_address,
          st.name as seat_type_name,
          pd.date as event_date,
          pd.event_name
        FROM payments p
        JOIN bookings b ON p.booking_id = b.booking_id
        JOIN shops s ON b.shop_id = s.shop_id
        JOIN seat_types st ON b.seat_type_id = st.seat_type_id
        JOIN procession_days pd ON b.day_id = pd.day_id
        WHERE p.payhere_order_id = ?
        ORDER BY s.name, pd.date, st.name
      `;

      const payments = await query(paymentsQuery, [payhereOrderId]);

      if (payments.length === 0) {
        throw new Error("No payments found for this order");
      }

      console.log(
        `📊 Found ${payments.length} payments for individual bookings`
      );

      // Get checkout customer for this order
      const checkoutCustomer = await getCheckoutCustomerByOrderId(
        payhereOrderId
      );
      if (!checkoutCustomer) {
        throw new Error(
          `No checkout customer found for order: ${payhereOrderId}`
        );
      }

      console.log(
        `✅ Found checkout customer: ${checkoutCustomer.first_name} ${checkoutCustomer.last_name}`
      );

      // Group bookings by shop_id and day_id combination
      console.log("🔄 Grouping bookings by shop and event date...");
      const shopDayGroups = {};

      payments.forEach((payment) => {
        const groupKey = `${payment.shop_id}_${payment.day_id}`;
        if (!shopDayGroups[groupKey]) {
          shopDayGroups[groupKey] = {
            shopId: payment.shop_id,
            dayId: payment.day_id,
            shopName: payment.shop_name,
            shopAddress: payment.shop_address,
            eventDate: payment.event_date,
            eventName: payment.event_name,
            bookings: [],
          };
        }
        shopDayGroups[groupKey].bookings.push(payment);
      });

      const groupKeys = Object.keys(shopDayGroups);
      console.log(
        `📋 Created ${groupKeys.length} shop-event groups:`,
        groupKeys.map((key) => {
          const group = shopDayGroups[key];
          return `${group.shopName} on ${new Date(
            group.eventDate
          ).toLocaleDateString()} (${group.bookings.length} bookings)`;
        })
      );

      // Create separate ticket records for each booking first
      console.log("🎫 Creating individual ticket records for each booking...");
      const allTicketRecords = [];

      // Generate shared ticket numbers for each group first
      console.log(
        "🔢 Pre-generating shared ticket numbers for each shop-day group..."
      );
      const groupSharedTicketNumbers = {};

      for (const groupKey of groupKeys) {
        const group = shopDayGroups[groupKey];
        const sharedTicketNumber = generateSharedTicketNumber(
          group.shopId,
          group.dayId,
          group.eventDate
        );
        groupSharedTicketNumbers[groupKey] = sharedTicketNumber;

        console.log(
          `🎯 Generated shared ticket number for group ${groupKey}:`,
          {
            groupKey,
            shopId: group.shopId,
            dayId: group.dayId,
            eventDate: group.eventDate,
            shopName: group.shopName,
            sharedTicketNumber,
          }
        );
      }

      console.log(
        `✅ Pre-generated ${
          Object.keys(groupSharedTicketNumbers).length
        } shared ticket numbers`
      );

      for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];
        const groupKey = `${payment.shop_id}_${payment.day_id}`;
        const sharedTicketNumber = groupSharedTicketNumbers[groupKey];

        console.log(
          `📋 Creating ticket record ${i + 1}/${payments.length} for booking:`,
          {
            bookingId: payment.booking_id,
            shopId: payment.shop_id,
            dayId: payment.day_id,
            shopName: payment.shop_name,
            amount: payment.amount,
            groupKey,
            sharedTicketNumber,
          }
        );

        try {
          // Create individual ticket record for this booking with proper foreign keys
          const ticketResult = await query(
            `INSERT INTO customer_tickets 
             (account_owner_id, checkout_customer_id, payhere_payment_id, payhere_order_id, 
              shop_id, booking_id, day_id, ticket_no, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              payment.customer_id, // account_owner_id (user_id from bookings)
              checkoutCustomer.id, // checkout_customer_id
              payherePaymentId,
              payhereOrderId,
              payment.shop_id, // Individual shop_id for this booking
              payment.booking_id, // Individual booking_id
              payment.day_id, // Individual day_id for this booking
              sharedTicketNumber, // Use shared ticket number for this group
            ]
          );

          const ticketId = ticketResult.insertId;

          console.log(`✅ Created ticket record with shared ticket number:`, {
            ticketId,
            sharedTicketNumber,
            bookingId: payment.booking_id,
            shopId: payment.shop_id,
            dayId: payment.day_id,
            groupKey,
            message: "All records in this group will share the same ticket_no",
          });

          // Store ticket info (PDF will be generated per group later)
          allTicketRecords.push({
            ticketId,
            ticketNumber: sharedTicketNumber, // Use shared ticket number
            bookingId: payment.booking_id,
            shopId: payment.shop_id,
            dayId: payment.day_id,
            groupKey: `${payment.shop_id}_${payment.day_id}`,
            paymentData: payment,
            shopInfo: {
              shopId: payment.shop_id,
              shopName: payment.shop_name,
              shopAddress: payment.shop_address,
            },
            bookingInfo: {
              bookingId: payment.booking_id,
              seatTypeName: payment.seat_type_name,
              quantity: payment.quantity,
              amount: payment.amount,
              eventDate: payment.event_date,
              eventName: payment.event_name,
            },
          });
        } catch (ticketError) {
          console.error(
            `❌ Failed to create ticket record for booking ${payment.booking_id}:`,
            ticketError
          );
          // Continue with other tickets but log the error
        }
      }

      console.log(
        `✅ Created ${allTicketRecords.length} individual ticket records`
      );

      // Now generate one PDF per shop-day group
      console.log("🎨 Generating PDFs for each shop-event group...");
      const pdfResults = {};

      for (const groupKey of groupKeys) {
        const group = shopDayGroups[groupKey];
        console.log(
          `🎨 Generating PDF for group: ${group.shopName} on ${new Date(
            group.eventDate
          ).toLocaleDateString()} (${group.bookings.length} bookings)`
        );

        try {
          // Use the shared ticket number from this group
          const groupTickets = allTicketRecords.filter(
            (t) => t.groupKey === groupKey
          );
          const sharedTicketNumber = groupSharedTicketNumbers[groupKey];

          console.log(
            `📄 Using shared ticket number: ${sharedTicketNumber} for group ${groupKey} (${groupTickets.length} tickets)`
          );

          // Calculate total amount for this group
          const groupTotalAmount = group.bookings.reduce(
            (sum, booking) => sum + parseFloat(booking.amount),
            0
          );

          // Prepare ticket data for PDF generation
          const ticketData = {
            customerInfo,
            shopInfo: {
              shopId: group.shopId,
              shopName: group.shopName,
              shopAddress: group.shopAddress,
            },
            eventInfo: {
              eventDate: group.eventDate
                ? new Date(group.eventDate).toLocaleDateString()
                : "TBD",
              eventName: group.eventName || "Kandy Esala Perahera",
            },
            paymentDetails: {
              amount: groupTotalAmount,
              currency: "LKR",
            },
            payhereOrderId,
            payherePaymentId,
            ticketNumber: sharedTicketNumber,
            paymentMethod: paymentMethod || "PayHere", // Add payment method with fallback
            // Include all bookings for this shop-event combination
            bookingDetails: group.bookings.map((booking) => ({
              bookingId: booking.booking_id,
              seatTypeName: booking.seat_type_name,
              quantity: booking.quantity,
              amount: booking.amount,
              eventDate: booking.event_date,
              eventName: booking.event_name,
            })),
          };

          console.log(`📊 Group ticket data prepared:`, {
            shopName: group.shopName,
            eventDate: ticketData.eventInfo.eventDate,
            totalAmount: groupTotalAmount,
            bookingsCount: group.bookings.length,
            seatTypes: group.bookings
              .map((b) => `${b.seat_type_name} (${b.quantity})`)
              .join(", "),
          });

          // Generate PDF for this group
          const pdfResult = await multiShopPdfService.generateShopTicketPDF(
            ticketData
          );

          if (pdfResult.success) {
            console.log(
              `✅ PDF generated successfully for group ${groupKey}:`,
              {
                pdfPath: pdfResult.filePath,
                qrCodePath: pdfResult.qrCodeFilePath,
              }
            );

            pdfResults[groupKey] = {
              success: true,
              pdfPath: pdfResult.filePath,
              qrCodePath: pdfResult.qrCodeFilePath,
              sharedTicketNumber,
            };
          } else {
            console.log(`⚠️ PDF generation failed for group ${groupKey}`);
            pdfResults[groupKey] = {
              success: false,
              sharedTicketNumber,
            };
          }
        } catch (pdfError) {
          console.error(
            `❌ PDF generation error for group ${groupKey}:`,
            pdfError
          );
          pdfResults[groupKey] = {
            success: false,
            error: pdfError.message,
          };
        }
      }

      // Update all ticket records with appropriate PDF paths
      console.log("🔄 Updating ticket records with PDF information...");
      for (const ticket of allTicketRecords) {
        const groupResult = pdfResults[ticket.groupKey];

        try {
          if (groupResult && groupResult.success) {
            // Update ticket record with PDF URL and QR code URL from the group
            // Note: ticket_no is already set during record creation with shared number
            await query(
              `UPDATE customer_tickets 
               SET ticket_url = ?, qrcode_url = ?, updated_at = NOW()
               WHERE ticket_id = ?`,
              [groupResult.pdfPath, groupResult.qrCodePath, ticket.ticketId]
            );

            console.log(
              `✅ Updated ticket ${ticket.ticketNumber} with group PDF:`,
              {
                ticketId: ticket.ticketId,
                groupKey: ticket.groupKey,
                pdfPath: groupResult.pdfPath,
                qrCodePath: groupResult.qrCodePath,
                sharedTicketNumber: ticket.ticketNumber,
                note: "ticket_no already set during creation",
              }
            );

            // Update local record for email
            ticket.pdfPath = groupResult.pdfPath;
            ticket.qrCodePath = groupResult.qrCodePath;
          } else {
            console.log(
              `⚠️ No PDF available for ticket ${ticket.ticketNumber}, but ticket_no already set during creation`
            );
            // ticket_no was already set during creation, no need to update
          }
        } catch (updateError) {
          console.error(
            `❌ Failed to update ticket ${ticket.ticketId}:`,
            updateError
          );
        }
      }

      if (allTicketRecords.length === 0) {
        throw new Error("No tickets were successfully created");
      }

      // Summary logging with enhanced group details
      console.log("📊 ENHANCED TICKET GENERATION SUMMARY:");
      console.log(`   📋 Total bookings processed: ${payments.length}`);
      console.log(
        `   🎫 Total ticket records created: ${allTicketRecords.length}`
      );
      console.log(`   🏪 Shop-event groups: ${groupKeys.length}`);
      console.log(
        `   📄 PDFs generated: ${
          Object.values(pdfResults).filter((r) => r.success).length
        }/${groupKeys.length}`
      );

      // Group details for logging with shared ticket numbers
      console.log("📋 DETAILED GROUP BREAKDOWN:");
      groupKeys.forEach((groupKey) => {
        const group = shopDayGroups[groupKey];
        const groupTickets = allTicketRecords.filter(
          (t) => t.groupKey === groupKey
        );
        const groupResult = pdfResults[groupKey];
        const sharedTicketNumber = groupSharedTicketNumbers[groupKey];

        console.log(
          `   📍 Group ${groupKey}: ${group.shopName} (${new Date(
            group.eventDate
          ).toLocaleDateString()})`
        );
        console.log(`      🎫 Shared ticket number: ${sharedTicketNumber}`);
        console.log(`      📊 ${groupTickets.length} tickets in this group`);
        console.log(
          `      📄 PDF generation: ${
            groupResult?.success ? "✅ Success" : "❌ Failed"
          }`
        );
        if (groupResult?.success) {
          console.log(`      📁 PDF: ${groupResult.pdfPath}`);
          console.log(`      🔗 QR: ${groupResult.qrCodePath}`);
        }
        console.log(
          `      📋 Ticket IDs: ${groupTickets
            .map((t) => t.ticketId)
            .join(", ")}`
        );
        console.log("");
      });

      // Verification logging - check that all tickets in same group have same ticket_no
      console.log("🔍 SHARED TICKET NUMBER VERIFICATION:");
      for (const groupKey of groupKeys) {
        const groupTickets = allTicketRecords.filter(
          (t) => t.groupKey === groupKey
        );
        const expectedSharedNumber = groupSharedTicketNumbers[groupKey];
        const actualNumbers = [
          ...new Set(groupTickets.map((t) => t.ticketNumber)),
        ];

        if (
          actualNumbers.length === 1 &&
          actualNumbers[0] === expectedSharedNumber
        ) {
          console.log(
            `   ✅ Group ${groupKey}: All ${groupTickets.length} tickets share number ${expectedSharedNumber}`
          );
        } else {
          console.log(`   ❌ Group ${groupKey}: Inconsistent ticket numbers!`);
          console.log(`      Expected: ${expectedSharedNumber}`);
          console.log(`      Found: ${actualNumbers.join(", ")}`);
        }
      }

      // Group tickets by shop-event combination for email display (preserve all PDFs)
      console.log(
        "📧 Preparing email data by grouping tickets by shop-event combination..."
      );
      const shopEventGroups = {};
      allTicketRecords.forEach((ticket) => {
        const groupKey = ticket.groupKey; // Use the same groupKey (shop_id_day_id)
        if (!shopEventGroups[groupKey]) {
          shopEventGroups[groupKey] = {
            shopInfo: ticket.shopInfo,
            pdfPath: ticket.pdfPath, // Each shop-event combination has its own PDF
            qrCodePath: ticket.qrCodePath, // Each shop-event combination has its own QR code
            eventDate: ticket.bookingInfo.eventDate,
            eventName: ticket.bookingInfo.eventName,
            bookingDetails: [], // Use bookingDetails to match email service expectations
          };
        }
        // Convert ticket info to booking format for email service
        shopEventGroups[groupKey].bookingDetails.push({
          bookingId: ticket.bookingId,
          seatTypeName: ticket.bookingInfo.seatTypeName,
          quantity: ticket.bookingInfo.quantity,
          amount: ticket.bookingInfo.amount,
          eventDate: ticket.bookingInfo.eventDate,
          eventName: ticket.bookingInfo.eventName,
          ticketNumber: ticket.ticketNumber,
        });
      });

      const shopTicketsForEmail = Object.values(shopEventGroups);
      console.log(
        `📧 Prepared ${shopTicketsForEmail.length} shop-event groups for email (each with separate PDF)`
      );

      // Log each group for debugging
      shopTicketsForEmail.forEach((group, index) => {
        console.log(
          `   📄 Group ${index + 1}: ${group.shopInfo.shopName} - ${new Date(
            group.eventDate
          ).toLocaleDateString()} (PDF: ${group.pdfPath ? "✅" : "❌"})`
        );
      });

      // Send email with improved error handling
      let emailResult = { success: false };
      try {
        console.log("📧 Attempting to send ticket email...");
        // Use the email service directly (it's exported as an instance)
        const emailService = multiShopEmailService;

        // Verify email connection first
        const connectionOk = await emailService.verifyConnection();
        if (!connectionOk) {
          console.log(
            "⚠️ Email service connection failed, skipping email send"
          );
        } else {
          const orderSummary = {
            totalAmount: allTicketRecords.reduce(
              (sum, ticket) => sum + parseFloat(ticket.bookingInfo.amount),
              0
            ),
            totalTickets: allTicketRecords.length,
            totalShops: shopTicketsForEmail.length,
          };

          console.log("📧 Email order summary:", orderSummary);

          emailResult = await emailService.sendMultiShopTicketEmail({
            email: customerInfo.email,
            firstName: customerInfo.firstName,
            lastName: customerInfo.lastName,
            payherePaymentId,
            payhereOrderId,
            shopTickets: shopTicketsForEmail,
            orderSummary,
            paymentMethod: paymentMethod || "PayHere", // Add payment method
          });

          if (emailResult.success) {
            console.log(`✅ Email sent successfully to ${customerInfo.email}`);

            // Clear cart after successful email sending
            try {
              console.log(
                "🛒 Clearing customer cart after successful payment and email..."
              );
              const {
                clearCartForCustomer,
              } = require("../controllers/cartController");

              // Get customer ID from the first payment record
              const customerId = payments[0]?.customer_id;
              if (customerId) {
                const cartClearResult = await clearCartForCustomer(customerId);
                console.log(
                  `✅ Cart cleared successfully: ${cartClearResult.itemsCleared} items removed`
                );
              } else {
                console.log(
                  "⚠️ Could not determine customer ID for cart clearing"
                );
              }
            } catch (cartClearError) {
              console.error(
                "⚠️ Cart clearing failed (non-critical):",
                cartClearError.message
              );
              // Don't fail the entire process if cart clearing fails
            }
          } else {
            console.log(
              `⚠️ Email sending failed: ${emailResult.error || "Unknown error"}`
            );
          }
        }
      } catch (emailError) {
        console.error(
          "⚠️ Email sending failed (non-critical):",
          emailError.message
        );
        // Don't throw error for email failures, tickets are already created
      }

      // Final success summary
      console.log("🎉 ENHANCED TICKET PROCESSING COMPLETED SUCCESSFULLY!");
      console.log(
        `📊 Results: ${allTicketRecords.length} ticket records, ${
          Object.values(pdfResults).filter((r) => r.success).length
        } PDFs, email: ${emailResult.success ? "✅" : "❌"}`
      );

      return {
        success: true,
        ticketsCreated: allTicketRecords.length,
        shopsProcessed: shopTicketsForEmail.length,
        shopTicketsGenerated: shopTicketsForEmail.length, // For backward compatibility
        emailSent: emailResult.success,
        messageId: emailResult.messageId,
        recipient: emailResult.recipient,
        shopTickets: shopTicketsForEmail.map((shopGroup) => ({
          shopName: shopGroup.shopInfo.shopName,
          eventDate: shopGroup.eventDate,
          ticketsCount: shopGroup.bookingDetails.length,
          bookingDetails: shopGroup.bookingDetails,
        })), // Updated to include event date for backward compatibility with paymentController
        ticketRecords: allTicketRecords, // New detailed format
        groupSummary: {
          totalGroups: groupKeys.length,
          groupDetails: groupKeys.map((groupKey) => {
            const group = shopDayGroups[groupKey];
            const groupTickets = allTicketRecords.filter(
              (t) => t.groupKey === groupKey
            );
            const groupResult = pdfResults[groupKey];
            return {
              groupKey,
              shopName: group.shopName,
              eventDate: group.eventDate,
              ticketsCount: groupTickets.length,
              pdfGenerated: groupResult?.success || false,
              pdfPath: groupResult?.pdfPath || null,
            };
          }),
        },
      };
    } catch (error) {
      console.error("❌ Multi-shop ticket processing failed:", error);
      throw new Error(`Multi-shop ticket processing failed: ${error.message}`);
    }
  }

  /**
   * Legacy method - maintained for backward compatibility
   */
  async createShopTicketRecord(
    customerId,
    payherePaymentId,
    shopTicketId,
    shopInfo,
    bookingDetails,
    ticketPath
  ) {
    console.log(
      "⚠️ Using legacy createShopTicketRecord method - consider using processMultiShopTickets instead"
    );

    try {
      // This method should now also use the enhanced structure
      const payhereOrderId = shopTicketId.split("_")[1]; // Extract from shopTicketId format
      const checkoutCustomer = await getCheckoutCustomerByOrderId(
        payhereOrderId
      );

      if (!checkoutCustomer) {
        throw new Error(
          `No checkout customer found for order: ${payhereOrderId}`
        );
      }

      // For legacy compatibility, we'll extract booking info from the first booking
      const firstBooking = bookingDetails[0];
      const bookingId = firstBooking?.bookingId || null;

      // Try to get shop_id and day_id from the booking if available
      let shopId = shopInfo.shopId || null;
      let dayId = null;

      if (bookingId) {
        const bookingData = await query(
          "SELECT shop_id, day_id FROM bookings WHERE booking_id = ?",
          [bookingId]
        );
        if (bookingData.length > 0) {
          shopId = bookingData[0].shop_id;
          dayId = bookingData[0].day_id;
        }
      }

      // Insert with enhanced fields when possible
      const initialTicketResult = await query(
        `INSERT INTO customer_tickets 
         (account_owner_id, checkout_customer_id, payhere_payment_id, payhere_order_id, 
          shop_id, booking_id, day_id, shop_info, booking_info, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          customerId,
          checkoutCustomer.id,
          payherePaymentId,
          shopTicketId,
          shopId,
          bookingId,
          dayId,
          JSON.stringify(shopInfo),
          JSON.stringify(bookingDetails),
        ]
      );

      const ticketId = initialTicketResult.insertId;
      const ticketNumber = generateTicketNumber(ticketId);

      await query(
        `UPDATE customer_tickets 
         SET ticket_no = ?, ticket_url = ?, updated_at = NOW()
         WHERE ticket_id = ?`,
        [ticketNumber, ticketPath, ticketId]
      );

      console.log(`✅ Legacy ticket record created:`, {
        ticketId,
        ticketNumber,
        shopName: shopInfo.shopName,
        shopId,
        bookingId,
        dayId,
      });

      return { ticketId, ticketNumber };
    } catch (error) {
      console.error("❌ Legacy ticket creation failed:", error);
      throw error;
    }
  }

  /**
   * Debug method to verify shared ticket number implementation
   * This method checks that records with same shop, event date, ticket_url, and qrcode_url share the same ticket_no
   */
  async verifySharedTicketNumbers(payhereOrderId) {
    try {
      console.log(
        `🔍 Verifying shared ticket numbers for order: ${payhereOrderId}`
      );

      // Get all customer tickets for this order
      const tickets = await query(
        `SELECT 
          ct.ticket_id,
          ct.ticket_no,
          ct.shop_id,
          ct.day_id,
          ct.ticket_url,
          ct.qrcode_url,
          s.name as shop_name,
          pd.date as event_date,
          pd.event_name
        FROM customer_tickets ct
        LEFT JOIN shops s ON ct.shop_id = s.shop_id
        LEFT JOIN procession_days pd ON ct.day_id = pd.day_id
        WHERE ct.payhere_order_id = ?
        ORDER BY ct.shop_id, ct.day_id, ct.ticket_id`,
        [payhereOrderId]
      );

      if (tickets.length === 0) {
        console.log(`⚠️ No tickets found for order: ${payhereOrderId}`);
        return { success: false, message: "No tickets found" };
      }

      console.log(`📊 Found ${tickets.length} tickets for verification`);

      // Group tickets by shop_id, day_id, ticket_url, qrcode_url
      const groups = {};
      tickets.forEach((ticket) => {
        const groupKey = `${ticket.shop_id}_${ticket.day_id}_${
          ticket.ticket_url || "null"
        }_${ticket.qrcode_url || "null"}`;

        if (!groups[groupKey]) {
          groups[groupKey] = {
            shopId: ticket.shop_id,
            dayId: ticket.day_id,
            shopName: ticket.shop_name,
            eventDate: ticket.event_date,
            eventName: ticket.event_name,
            ticketUrl: ticket.ticket_url,
            qrcodeUrl: ticket.qrcode_url,
            tickets: [],
          };
        }

        groups[groupKey].tickets.push({
          ticketId: ticket.ticket_id,
          ticketNo: ticket.ticket_no,
        });
      });

      const groupKeys = Object.keys(groups);
      console.log(`🔍 Verification found ${groupKeys.length} distinct groups`);

      let allValid = true;
      const results = [];

      groupKeys.forEach((groupKey) => {
        const group = groups[groupKey];
        const uniqueTicketNumbers = [
          ...new Set(group.tickets.map((t) => t.ticketNo)),
        ];

        const result = {
          groupKey,
          shopId: group.shopId,
          dayId: group.dayId,
          shopName: group.shopName,
          eventDate: group.eventDate,
          ticketUrl: group.ticketUrl,
          qrcodeUrl: group.qrcodeUrl,
          ticketsCount: group.tickets.length,
          uniqueTicketNumbers,
          isValid:
            uniqueTicketNumbers.length === 1 && uniqueTicketNumbers[0] !== null,
          sharedTicketNumber: uniqueTicketNumbers[0] || null,
        };

        results.push(result);

        if (result.isValid) {
          console.log(
            `   ✅ Group ${groupKey}: All ${result.ticketsCount} tickets share number "${result.sharedTicketNumber}"`
          );
          console.log(
            `      📍 ${result.shopName} on ${new Date(
              result.eventDate
            ).toLocaleDateString()}`
          );
        } else {
          console.log(
            `   ❌ Group ${groupKey}: Invalid shared ticket numbers!`
          );
          console.log(
            `      📍 ${result.shopName} on ${new Date(
              result.eventDate
            ).toLocaleDateString()}`
          );
          console.log(
            `      📊 ${
              result.ticketsCount
            } tickets with numbers: ${uniqueTicketNumbers.join(", ")}`
          );
          allValid = false;
        }
      });

      console.log(
        `🔍 Verification complete: ${
          allValid ? "✅ All groups valid" : "❌ Some groups invalid"
        }`
      );

      return {
        success: allValid,
        totalTickets: tickets.length,
        totalGroups: groupKeys.length,
        validGroups: results.filter((r) => r.isValid).length,
        invalidGroups: results.filter((r) => !r.isValid).length,
        results,
      };
    } catch (error) {
      console.error("❌ Error verifying shared ticket numbers:", error);
      throw new Error(`Verification failed: ${error.message}`);
    }
  }
}

module.exports = new MultiShopTicketService();
