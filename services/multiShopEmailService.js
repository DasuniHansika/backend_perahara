// services/multiShopEmailService.js
const nodemailer = require("nodemailer");
const fs = require("fs").promises;

class MultiShopEmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
      port: process.env.BREVO_SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_PASS,
      },
    });
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log("✅ Multi-shop email service ready");
      return true;
    } catch (error) {
      console.error("❌ Multi-shop email service connection failed:", error);
      return false;
    }
  }

  /**
   * Send multi-shop ticket email with multiple PDF attachments
   */
  async sendMultiShopTicketEmail(emailData) {
    try {
      const {
        email,
        firstName,
        lastName,
        payherePaymentId,
        payhereOrderId,
        shopTickets, // Array of shop ticket objects
        orderSummary, // Overall order summary with totals
        paymentMethod, // Payment method from PayHere notification
      } = emailData;

      // Create email HTML content with comprehensive table
      const htmlContent = this.generateMultiShopEmailHTML({
        firstName,
        lastName,
        payherePaymentId,
        payhereOrderId,
        shopTickets,
        orderSummary,
        paymentMethod, // Pass payment method to HTML generator
      });

      // Prepare email options
      const mailOptions = {
        from: {
          name: process.env.BREVO_FROM_NAME || "Perahera Gallery",
          address: process.env.BREVO_FROM_EMAIL,
        },
        to: email,
        subject: `Your Perahera Gallery Tickets - Order #${payhereOrderId}`,
        html: htmlContent,
        attachments: [],
      }; // Add PDF attachments for each shop-event combination
      console.log(
        `📎 Processing ${shopTickets.length} shop-event groups for email attachments...`
      );

      for (let i = 0; i < shopTickets.length; i++) {
        const shopTicket = shopTickets[i];
        const shopName = shopTicket.shopInfo?.shopName || "Unknown_Shop";
        const eventDate = shopTicket.eventDate
          ? new Date(shopTicket.eventDate)
              .toLocaleDateString()
              .replace(/\//g, "-")
          : "Unknown_Date";

        console.log(
          `📎 Processing attachment ${i + 1}/${
            shopTickets.length
          }: ${shopName} (${eventDate})`
        );
        console.log(`   PDF Path: ${shopTicket.pdfPath || "Not available"}`);
        console.log(
          `   File exists check: ${
            shopTicket.pdfPath ? "Checking..." : "Skipped - no path"
          }`
        );

        if (shopTicket.pdfPath && (await this.fileExists(shopTicket.pdfPath))) {
          const attachmentFilename = `Perahera_Ticket_${shopName.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}_${eventDate.replace(/[^a-zA-Z0-9]/g, "_")}_${payhereOrderId}.pdf`;

          mailOptions.attachments.push({
            filename: attachmentFilename,
            path: shopTicket.pdfPath,
            contentType: "application/pdf",
          });

          console.log(`   ✅ Added attachment: ${attachmentFilename}`);
        } else {
          console.log(
            `   ❌ Skipped attachment - file does not exist: ${shopTicket.pdfPath}`
          );
        }
      }

      console.log(
        `📎 Total attachments prepared: ${mailOptions.attachments.length}/${shopTickets.length}`
      );
      if (mailOptions.attachments.length > 0) {
        console.log(`📎 Attachment list:`);
        mailOptions.attachments.forEach((att, index) => {
          console.log(`   ${index + 1}. ${att.filename}`);
        });
      }

      // Send email
      const result = await this.transporter.sendMail(mailOptions);

      console.log("✅ Multi-shop ticket email sent successfully:", {
        messageId: result.messageId,
        to: email,
        orderId: payhereOrderId,
        attachmentsCount: mailOptions.attachments.length,
        shops: shopTickets
          .map((st) => st.shopInfo?.shopName || "Unknown Shop")
          .join(", "),
      });

      return {
        success: true,
        messageId: result.messageId,
        recipient: email,
        attachmentsCount: mailOptions.attachments.length,
      };
    } catch (error) {
      console.error("❌ Failed to send multi-shop ticket email:", error);
      throw new Error(`Multi-shop email sending failed: ${error.message}`);
    }
  }

  /**
   * Generate HTML content for multi-shop ticket email
   */
  generateMultiShopEmailHTML(data) {
    const {
      firstName,
      lastName,
      payherePaymentId,
      payhereOrderId,
      shopTickets,
      orderSummary,
      paymentMethod, // Add payment method parameter
    } = data;

    // Generate comprehensive table data
    const tableRows = [];
    let totalCost = 0;
    shopTickets.forEach((shopTicket) => {
      shopTicket.bookingDetails.forEach((booking) => {
        const cost = parseFloat(booking.amount);
        totalCost += cost;

        tableRows.push({
          shopName: shopTicket.shopInfo?.shopName || "Unknown Shop",
          eventDate: booking.eventDate || "TBD",
          seatType: booking.seatTypeName,
          quantity: booking.quantity,
          cost: cost.toFixed(2),
        });
      });
    });

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Perahera Gallery Tickets</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&family=Italianno&display=swap" rel="stylesheet">
        <style>
            body { 
                font-family: 'DM Sans', sans-serif; 
                line-height: 1.6; 
                color: #0F172A; 
                max-width: 700px; 
                margin: 0 auto; 
                padding: 20px; 
                background-color: #F8FAFC;
            }
            .header { 
                background-color: #0F172A; 
                color: white; 
                padding: 30px; 
                text-align: center; 
                border-radius: 4px 4px 0 0; 
            }
            .logo { 
                font-family: 'Italianno', cursive; 
                font-size: 35px; 
                font-weight: bold; 
                margin-bottom: 10px; 
            }
            .content { 
                background: #F1F5F9; 
                padding: 30px; 
                border-radius: 0 0 4px 4px; 
            }
            .order-info { 
                background: white; 
                padding: 20px; 
                margin: 20px 0; 
                border-radius: 4px; 
                border: none;
            }
            .info-row { 
                display: flex; 
                justify-content: space-between; 
                margin: 10px 0; 
                padding: 8px 0; 
                border-bottom: 1px solid #E2E8F0; 
            }
            .info-label { 
                font-weight: 700; 
                color: #64748B; 
            }
            .info-value { 
                color: #0F172A; 
                font-weight: 400;
            }
            .instructions { 
                background: white; 
                padding: 20px; 
                margin: 20px 0; 
                border-radius: 4px; 
                border: none;
            }
            .instructions h3 { 
                color: #0F172A; 
                font-weight: 700; 
                margin-bottom: 15px; 
            }
            .instructions ul { 
                color: #1E293B; 
                padding-left: 20px; 
            }
            .instructions li { 
                margin: 8px 0; 
            }
            .success-badge { 
                background: #DCFCE7; 
                color: #166534; 
                padding: 15px; 
                border-radius: 4px; 
                text-align: center; 
                margin: 20px 0; 
                font-weight: 700;
            }
            .footer { 
                text-align: center; 
                margin-top: 30px; 
                padding-top: 20px; 
                border-top: 1px solid #E2E8F0; 
                color: #64748B; 
                font-size: 14px; 
            }
            .total-section { 
                background: white; 
                padding: 20px; 
                margin: 20px 0; 
                border-radius: 4px; 
                border: none;
                text-align: center;
            }
            .total-amount { 
                font-size: 24px; 
                font-weight: 700; 
                color: #0F172A; 
                margin: 10px 0;
            }
            .table-container {
                overflow-x: auto;
                margin: 20px 0;
                border-radius: 4px;
                background: white;
            }
            .comprehensive-table { 
                width: 100%; 
                min-width: 600px;
                border-collapse: collapse; 
                background: white; 
            }
            .comprehensive-table th { 
                background: #0F172A; 
                color: white; 
                padding: 15px 10px; 
                text-align: left; 
                font-weight: 700; 
                font-size: 14px; 
            }
            .comprehensive-table td { 
                padding: 12px 10px; 
                border-bottom: 1px solid #E2E8F0; 
                font-size: 14px; 
                color: #1E293B;
            }
            .comprehensive-table tr:nth-child(even) { 
                background: #F8FAFC; 
            }
            .comprehensive-table .total-row { 
                background: #DCFCE7; 
                font-weight: 700; 
                color: #166534; 
            }
            .comprehensive-table .total-row td { 
                border-top: 2px solid #22C55E; 
                padding: 15px 10px; 
            }
            .attachments-info { 
                background: #F1F5F9; 
                border: 1px solid #E2E8F0; 
                border-radius: 4px; 
                padding: 15px; 
                margin: 20px 0; 
            }
            .attachments-info h4 { 
                color: #0F172A; 
                margin-bottom: 10px; 
                font-weight: 700;
            }
            .attachment-list { 
                list-style: none; 
                padding: 0; 
            }
            .attachment-list li { 
                margin: 5px 0; 
                padding: 5px 0; 
                border-bottom: 1px solid #E2E8F0; 
                color: #1E293B;
            }
            .attachment-list li:last-child { 
                border-bottom: none; 
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo">Perahera Gallery</div>
            <h1 style="margin: 0; font-weight: 700;">Booking Confirmed!</h1>
            <p style="margin: 10px 0 0 0;">Your tickets are ready</p>
        </div>
        
        <div class="content">
            <div class="success-badge">
                ✅ Payment Successful - All Tickets Generated
            </div>
            
            <h2 style="color: #0F172A; font-weight: 700;">Dear ${firstName} ${lastName},</h2>
            
            <p style="color: #1E293B; margin: 20px 0;">Thank you for your booking! Your payment has been processed successfully and your tickets are attached to this email. You have made bookings across ${
              shopTickets.length
            } shop-event combination${
      shopTickets.length > 1 ? "s" : ""
    } for the Kandy Esala Perahera.</p>
            
            <div class="order-info">
                <h3 style="color: #0F172A; font-weight: 700; margin-top: 0;">Order Information</h3>
                <div class="info-row">
                    <span class="info-label">Order ID:</span>
                    <span class="info-value">${payhereOrderId}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Payment ID:</span>
                    <span class="info-value">${payherePaymentId}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Payment Method:</span>
                    <span class="info-value">${
                      paymentMethod || "PayHere"
                    }</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Shop-Event Combinations:</span>
                    <span class="info-value">${shopTickets.length}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Total Bookings:</span>
                    <span class="info-value">${tableRows.length}</span>
                </div>
            </div>

            <div class="total-section">
                <h3 style="color: #0F172A; font-weight: 700; margin-top: 0;">Total Amount</h3>
                <div class="total-amount">LKR ${totalCost.toFixed(2)}</div>
            </div>

            <h3 style="color: #0F172A; font-weight: 700;">Complete Booking Summary</h3>
            <div class="table-container">
                <table class="comprehensive-table">
                    <thead>
                        <tr>
                            <th>Shop Name</th>
                            <th>Event Date</th>
                            <th>Seat Type</th>
                            <th>Quantity</th>
                            <th>Cost (LKR)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows
                          .map(
                            (row) => `
                        <tr>
                            <td><strong>${row.shopName}</strong></td>
                            <td>${
                              row.eventDate
                                ? new Date(row.eventDate).toLocaleDateString(
                                    "en-US",
                                    {
                                      year: "numeric",
                                      month: "long",
                                      day: "numeric",
                                    }
                                  )
                                : "TBD"
                            }</td>
                            <td>${row.seatType}</td>
                            <td>${row.quantity}</td>
                            <td>LKR ${row.cost}</td>
                        </tr>
                    `
                          )
                          .join(
                            ""
                          )}                        <tr class="total-row">
                            <td colspan="4"><strong>TOTAL COST</strong></td>
                            <td><strong>LKR ${totalCost.toFixed(
                              2
                            )}</strong></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="attachments-info">
                <h4>📎 Attached Tickets</h4>
                <p style="color: #1E293B; margin: 10px 0;">You will find ${
                  shopTickets.length
                } PDF ticket${
      shopTickets.length > 1 ? "s" : ""
    } attached to this email (one per shop-event combination):</p>
                <ul class="attachment-list">
                    ${shopTickets
                      .map(
                        (shopTicket) => `
                        <li>📄 <strong>${
                          shopTicket.shopInfo?.shopName || "Unknown Shop"
                        }</strong> - ${
                          shopTicket.eventDate
                            ? new Date(shopTicket.eventDate).toLocaleDateString(
                                "en-US",
                                {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                }
                              )
                            : "TBD"
                        }</li>
                    `
                      )
                      .join("")}
                </ul>
                <p style="color: #64748B; font-size: 14px; margin: 10px 0 0 0;"><strong>Important:</strong> Each PDF ticket is specific to one shop-event combination. Present the relevant ticket when visiting each shop location on the specified date.</p>
            </div>
            
            <div class="instructions">
                <h3>Important Instructions</h3>
                <ul>
                    <li>Present your ticket (printed or digital) at the respective shop entrance</li>
                    <li>Arrive at least 30 minutes before the event starts</li>
                    <li>Each ticket is valid only for its designated shop and event date</li>
                    <li>Tickets are non-transferable and non-refundable</li>
                    <li>Photography may be restricted during certain segments</li>
                    <li>Follow all venue rules and staff instructions</li>
                    <li>Keep your ticket safe and accessible during the event</li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p><strong>Generated on:</strong> ${new Date().toLocaleDateString(
              "en-US",
              {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }
            )}</p>
            <p><strong>Valid for:</strong> Kandy Esala Perahera ${new Date().getFullYear()}</p>
            <p><strong>Support:</strong> contact@peraheragallery.com</p>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send test email (for debugging)
   */
  async sendTestEmail(toEmail) {
    try {
      const mailOptions = {
        from: {
          name: process.env.BREVO_FROM_NAME || "Perahera Gallery",
          address: process.env.BREVO_FROM_EMAIL,
        },
        to: toEmail,
        subject: "Multi-Shop Ticket System Test",
        html: `
          <h2>Multi-Shop Email Service Test</h2>
          <p>This is a test email to verify that the multi-shop email service is working correctly.</p>
          <p>Sent at: ${new Date().toLocaleString()}</p>
        `,
      };

      const result = await this.transporter.sendMail(mailOptions);

      console.log("✅ Multi-shop test email sent successfully:", {
        messageId: result.messageId,
        to: toEmail,
      });

      return {
        success: true,
        messageId: result.messageId,
        recipient: toEmail,
      };
    } catch (error) {
      console.error("❌ Failed to send multi-shop test email:", error);
      throw new Error(`Test email sending failed: ${error.message}`);
    }
  }
}

module.exports = new MultiShopEmailService();
