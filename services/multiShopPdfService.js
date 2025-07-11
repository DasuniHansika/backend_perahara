// services/multiShopPdfService.js
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs").promises;
const QRCodeService = require("./qrCodeService");

class MultiShopPdfService {
  constructor() {
    this.ticketsDir = path.join(__dirname, "..", "uploads", "tickets");
    this.qrCodeService = new QRCodeService();
    this.ensureTicketsDirectory();
  }

  /**
   * Ensure tickets directory exists
   */
  async ensureTicketsDirectory() {
    try {
      await fs.mkdir(this.ticketsDir, { recursive: true });
      console.log("✅ Tickets directory ensured:", this.ticketsDir);
    } catch (error) {
      console.error("❌ Failed to create tickets directory:", error);
    }
  }
  /**
   * Generate ticket PDF for a specific shop with multiple seat types
   */
  async generateShopTicketPDF(shopTicketData) {
    let browser = null;

    try {
      const {
        customerInfo,
        shopInfo,
        eventInfo, // New: specific event information for this ticket
        bookingDetails, // Array of bookings for this shop-event combination
        payhereOrderId,
        payherePaymentId,
        ticketNumber, // Add ticket number support
      } = shopTicketData;

      // Validate that ticket number is provided
      if (!ticketNumber) {
        throw new Error(
          "Ticket number is required for multi-shop PDF generation"
        );
      }

      // Generate QR code for the ticket (save file and get data URL)
      console.log(
        `🎫 Generating QR code for multi-shop ticket: ${ticketNumber}`
      );
      const qrCodeResult = await this.qrCodeService.generateTicketQRCode(
        ticketNumber
      );

      if (!qrCodeResult.success) {
        throw new Error("Failed to generate QR code for multi-shop ticket");
      }

      // Generate unique filename using ticket number, shop name, and event date
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safEventDate = eventInfo.eventDate.replace(/[^a-zA-Z0-9]/g, "_");
      const filename = `ticket_${ticketNumber.replace(
        /[^a-zA-Z0-9]/g,
        "_"
      )}_${shopInfo.shopName.replace(
        /[^a-zA-Z0-9]/g,
        "_"
      )}_${safEventDate}_${timestamp}.pdf`;
      const filePath = path.join(this.ticketsDir, filename);

      // Launch browser
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
        ],
      });

      const page = await browser.newPage(); // Set page format
      await page.setViewport({ width: 800, height: 1200 });

      // Generate HTML content with ticket number and QR code
      const htmlContent = this.generateShopTicketHTML({
        ...shopTicketData,
        qrCodeDataUrl: qrCodeResult.dataUrl,
      });

      // Set content and generate PDF
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        path: filePath,
        format: "A4",
        printBackground: true,
        margin: {
          top: "0.5in",
          right: "0.5in",
          bottom: "0.5in",
          left: "0.5in",
        },
      });

      await browser.close();

      console.log("✅ Shop ticket PDF generated successfully:", {
        filename,
        path: filePath,
        shop: shopInfo.shopName,
        bookingsCount: bookingDetails.length,
        size: `${(pdfBuffer.length / 1024).toFixed(2)} KB`,
      });

      return {
        success: true,
        filename,
        filePath,
        size: pdfBuffer.length,
        shopName: shopInfo.shopName,
        qrCodeFilePath: qrCodeResult.filePath,
        qrCodeFileName: qrCodeResult.filename,
      };
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      console.error("❌ Shop PDF generation failed:", error);
      throw new Error(`Shop PDF generation failed: ${error.message}`);
    }
  }

  /**
   * Generate HTML content for shop ticket PDF
   */ generateShopTicketHTML(shopTicketData) {
    const {
      customerInfo,
      shopInfo,
      eventInfo,
      bookingDetails,
      payhereOrderId,
      payherePaymentId,
      ticketNumber,
      qrCodeDataUrl,
      paymentMethod, // Add payment method from PayHere notification
    } = shopTicketData;

    const currentDate = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Format event date as dd-mm-yyyy
    const formatEventDate = (dateString) => {
      if (!dateString) return "TBD";
      try {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      } catch (error) {
        return dateString; // Return original if formatting fails
      }
    };

    // Calculate total amount for this shop-event combination
    const totalAmount = bookingDetails.reduce(
      (sum, booking) => sum + parseFloat(booking.amount),
      0
    );

    // Since this ticket is for one specific event date, no need to group
    const eventDate = formatEventDate(eventInfo.eventDate);
    const eventName = eventInfo.eventName;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Perahera Gallery Ticket - ${shopInfo.shopName}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Italianno&display=swap');
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'DM Sans', sans-serif; line-height: 1.6; color: #0F172A; background: #F8FAFC; }
            .ticket-container { max-width: 800px; margin: 20px auto; background: #F1F5F9; border-radius: 4px; overflow: hidden; }
            
            .ticket-header { background: #0F172A; color: white; padding: 40px 30px; text-align: center; position: relative; }
            .ticket-header::after { content: ''; position: absolute; bottom: -10px; left: 0; width: 100%; height: 20px; background: radial-gradient(circle at 10px 10px, transparent 8px, #F1F5F9 8px); background-size: 20px 20px; }
            
            .logo { font-family: 'Italianno', cursive; font-size: 35px; font-weight: bold; margin-bottom: 10px; color: white; }
            .ticket-title { font-family: 'DM Sans', sans-serif; font-size: 24px; margin-bottom: 5px; color: white; }
            .ticket-subtitle { font-family: 'DM Sans', sans-serif; font-size: 16px; opacity: 0.9; color: white; }
            .shop-name { font-family: 'DM Sans', sans-serif; font-size: 18px; font-weight: 600; margin-top: 20px; padding: 12px 24px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; display: inline-block; color: white; }
            .event-info { font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500; margin-top: 8px; padding: 8px 16px; background: rgba(255,255,255,0.05); border-radius: 4px; display: inline-block; color: white; opacity: 0.9; }
            
            .ticket-body { padding: 40px 30px; }
            .ticket-number { text-align: center; margin-bottom: 30px; }
            .ticket-number h2 { font-size: 18px; color: #64748B; margin-bottom: 10px; }
            .ticket-number .number { font-size: 28px; font-weight: bold; color: #0F172A; font-family: 'DM Sans', sans-serif; letter-spacing: 2px; }
            
            .info-section { margin-bottom: 30px; }
            .section-title { font-size: 18px; font-weight: bold; color: #0F172A; margin-bottom: 15px; padding-bottom: 5px; border-bottom: 2px solid #0F172A; }
            
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            .info-item { padding: 15px; background: #F8FAFC; border-radius: 4px; }
            .info-label { font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 700; margin-bottom: 5px; }
            .info-value { font-size: 16px; color: #0F172A; font-weight: 500; }
            
            .bookings-table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #F8FAFC; border-radius: 4px; overflow: hidden; }
            .bookings-table th { background: #0F172A; color: white; padding: 15px 12px; text-align: left; font-weight: bold; font-size: 14px; }
            .bookings-table td { padding: 12px; border-bottom: 1px solid #E2E8F0; font-size: 14px; color: #1E293B; }
            .bookings-table tr:nth-child(even) { background: #F1F5F9; }
            .bookings-table tr:hover { background: #E2E8F0; }
            
            .date-group { margin: 25px 0; }
            .date-header { background: #F8FAFC; color: #0F172A; padding: 12px 20px; font-weight: bold; font-size: 16px; border-radius: 4px; margin-bottom: 10px; }
            
            .payment-summary { background: #F8FAFC; border-radius: 4px; padding: 20px; margin: 20px 0; }
            .payment-summary h3 { color: #0F172A; margin-bottom: 15px; font-weight: 700; }
            .payment-row { display: flex; justify-content: space-between; margin: 8px 0; color: #1E293B; }
            .payment-total { font-size: 18px; font-weight: bold; color: #0F172A; border-top: 2px solid #0F172A; padding-top: 10px; margin-top: 10px; }
            
            .qr-section { text-align: center; margin: 30px 0; padding: 20px; background: #F8FAFC; border-radius: 4px; }
            .qr-placeholder { width: 120px; height: 120px; background: #E2E8F0; margin: 0 auto 15px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #64748B; }
            
            .instructions { background: #F8FAFC; border-radius: 4px; padding: 20px; margin: 20px 0; }
            .instructions h3 { color: #0F172A; margin-bottom: 15px; font-weight: 700; }
            .instructions ul { list-style: none; }
            .instructions li { margin: 8px 0; padding-left: 20px; position: relative; color: #1E293B; }
            .instructions li::before { content: '✓'; position: absolute; left: 0; color: #0F172A; font-weight: bold; }
            
            .ticket-footer { background: #0F172A; color: white; padding: 20px 30px; text-align: center; position: relative; }
            .ticket-footer::before { content: ''; position: absolute; top: -10px; left: 0; width: 100%; height: 20px; background: radial-gradient(circle at 10px 10px, transparent 8px, #F1F5F9 8px); background-size: 20px 20px; }
            .footer-info { font-family: 'DM Sans', sans-serif; font-size: 12px; color: white; margin: 5px 0; opacity: 0.9; }
            
            .security-features { margin-top: 20px; padding-top: 20px; border-top: 1px dashed #64748B; }
            .security-features h4 { color: #64748B; margin-bottom: 10px; font-size: 14px; }
            .security-code { font-family: 'DM Sans', sans-serif; font-size: 12px; color: #64748B; letter-spacing: 1px; }
            
            @media print { body { background: #F8FAFC; } .ticket-container { margin: 0; } }
        </style>
    </head>
    <body>
        <div class="ticket-container">
            <div class="ticket-header">
                <div class="logo">Perahera Gallery</div>
                <div class="ticket-title">OFFICIAL ENTRY TICKET</div>
                <div class="ticket-subtitle">Kandy Esala Perahera Experience</div>
                <div class="shop-name">${shopInfo.shopName}</div>
                <div class="event-info">${eventDate}${
      eventName ? ` - ${eventName}` : ""
    }</div>
            </div>
            
            <div class="ticket-body">                <div class="ticket-number">
                    <h2>TICKET NUMBER</h2>
                    <div class="number">${ticketNumber || payhereOrderId}</div>
                </div>
                
                <div class="info-section">
                    <div class="section-title">Customer Information</div>
                    <div class="info-grid">
                        <div class="info-item">
                            <div class="info-label">Full Name</div>
                            <div class="info-value">${customerInfo.firstName} ${
      customerInfo.lastName
    }</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Email</div>
                            <div class="info-value">${customerInfo.email}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Phone</div>
                            <div class="info-value">${
                              customerInfo.phone || "N/A"
                            }</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Shop Location</div>
                            <div class="info-value">${
                              shopInfo.shopAddress || "Kandy"
                            }</div>
                        </div>
                    </div>
                </div>
                
                <div class="info-section">
                    <div class="section-title">Booking Details - ${eventDate}</div>
                    
                    <table class="bookings-table">
                        <thead>
                            <tr>
                                <th>Seat Type</th>
                                <th>Quantity</th>
                                <th>Cost per Seat</th>
                                <th>Total Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${bookingDetails
                              .map(
                                (booking) => `
                                <tr>
                                    <td><strong>${
                                      booking.seatTypeName
                                    }</strong></td>
                                    <td>${booking.quantity}</td>
                                    <td>LKR ${(
                                      parseFloat(booking.amount) /
                                      booking.quantity
                                    ).toFixed(2)}</td>
                                    <td>LKR ${parseFloat(
                                      booking.amount
                                    ).toFixed(2)}</td>
                                </tr>
                            `
                              )
                              .join("")}
                        </tbody>
                    </table>
                </div>
                
                <div class="payment-summary">
                    <h3>Payment Summary</h3>
                    <div class="payment-row">
                        <span>Payment Method:</span>
                        <span>${paymentMethod || "PayHere"}</span>
                    </div>
                    <div class="payment-row">
                        <span>Payment Date:</span>
                        <span>${currentDate}</span>
                    </div>
                    <div class="payment-row payment-total">
                        <span>Total Amount for this Ticket:</span>
                        <span>LKR ${totalAmount.toFixed(2)}</span>
                    </div>
                </div>
                  <div class="qr-section">
                    ${
                      qrCodeDataUrl
                        ? `<img src="${qrCodeDataUrl}" alt="Ticket QR Code" style="width: 120px; height: 120px; margin: 0 auto 15px;">`
                        : `<div class="qr-placeholder">
                            QR CODE<br>
                            ${ticketNumber || payhereOrderId}
                        </div>`
                    }
                    <p><strong>Scan this QR code for quick entry verification</strong></p>
                    ${
                      ticketNumber
                        ? `<p style="font-size: 12px; color: #666;">Ticket: ${ticketNumber}</p>`
                        : ""
                    }
                </div>
                
                <div class="instructions">
                    <h3>Important Instructions</h3>
                    <ul>
                        <li>Present this ticket (printed or digital) at the ${
                          shopInfo.shopName
                        } entrance</li>
                        <li>Arrive at least 30 minutes before the event starts</li>
                        <li>This ticket is valid only for ${
                          shopInfo.shopName
                        }</li>
                        <li>This ticket is non-transferable and non-refundable</li>
                        <li>Photography may be restricted during certain segments</li>
                        <li>Follow all venue rules and staff instructions</li>
                    </ul>
                </div>
            </div>
            
            <div class="ticket-footer">
                <div class="footer-info">Generated on: ${currentDate}</div>
                <div class="footer-info">Valid for: Kandy Esala Perahera ${new Date().getFullYear()}</div>
                <div class="footer-info">Shop: ${shopInfo.shopName}</div>
                <div class="footer-info">For support: contact@peraheragallery.com</div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Generate security code for ticket
   */
  generateSecurityCode(orderId) {
    const crypto = require("crypto");
    const hash = crypto
      .createHash("sha256")
      .update(orderId + Date.now())
      .digest("hex");
    return hash.substring(0, 16).toUpperCase();
  }

  /**
   * Get ticket file path
   */
  getTicketPath(filename) {
    return path.join(this.ticketsDir, filename);
  }

  /**
   * Delete ticket file
   */
  async deleteTicket(filename) {
    try {
      const filePath = path.join(this.ticketsDir, filename);
      await fs.unlink(filePath);
      console.log("✅ Ticket file deleted:", filename);
      return true;
    } catch (error) {
      console.error("❌ Failed to delete ticket file:", error);
      return false;
    }
  }
}

module.exports = new MultiShopPdfService();
