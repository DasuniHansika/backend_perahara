// services/emailService.js
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs").promises;

class EmailService {
  constructor() {
    // Create Brevo transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST,
      port: parseInt(process.env.BREVO_SMTP_PORT),
      secure: false, // Use STARTTLS
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_PASS,
      },
      logger: true, // Add this line
  debug: true 
    });

    
    // Verify transporter configuration
    this.verifyConnection();
  }

async verifyConnection() {
  try {
    await this.transporter.verify();
    console.log("✅ Email service connected successfully to Brevo SMTP");
  } catch (error) {
    console.error("❌ Email service connection failed:", error);
    // Log the full error object to see details
    console.error("Full error details:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response
    });
  }
}
 async sendSellerWelcomeEmail(sellerData) {
  try {
    const { email, firstName, lastName, sellerId, username, mobileNumber } = sellerData;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { padding: 20px; background: #f9f9f9; border-radius: 0 0 5px 5px; }
              .details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border: 1px solid #ddd; }
              .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #777; }
          </style>
      </head>
      <body>
          <div class="header">
              <h1>Welcome to Perahera Gallery!</h1>
              <p>Your seller account has been successfully created</p>
          </div>
          
          <div class="content">
              <p>Dear ${firstName} ${lastName},</p>
              
              <div class="details">
                  <h3>Your Seller Account Details</h3>
                  <p><strong>Seller ID:</strong> ${sellerId}</p>
                  <p><strong>Username:</strong> ${username}</p>
                  <p><strong>Email:</strong> ${email}</p>
                  ${mobileNumber ? `<p><strong>Phone:</strong> ${mobileNumber}</p>` : ''}
              </div>
              
              <p>You can now log in to your seller dashboard to manage your shops and seats.</p>
              
              <p>If you have any questions, please contact our support team.</p>
              
              <p>Best regards,<br>
              The Perahera Gallery Team</p>
          </div>
          
          <div class="footer">
              <p>This is an automated message. Please do not reply directly to this email.</p>
              <p>&copy; ${new Date().getFullYear()} Perahera Gallery. All rights reserved.</p>
          </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: {
        name: process.env.BREVO_FROM_NAME || "Perahera Gallery",
        address: process.env.BREVO_FROM_EMAIL,
      },
      to: email,
      subject: `Welcome to Perahera Gallery - Seller Account Created`,
      html: htmlContent,
    };

    const result = await this.transporter.sendMail(mailOptions);
    console.log("✅ Seller welcome email sent:", {
      messageId: result.messageId,
      to: email,
      sellerId: sellerId
    });

    return result;
  } catch (error) {
    console.error("❌ Failed to send seller welcome email:", error);
    throw error;
  }
}

  /**
   * Send ticket email with PDF attachment
   */
  async sendTicketEmail(ticketData) {
    try {
      const {
        email,
        firstName,
        lastName,
        ticketUrl,
        payherePaymentId,
        payhereOrderId,
        seatDetails,
        paymentDetails,
      } = ticketData;

      // Create email HTML content
      const htmlContent = this.generateTicketEmailHTML({
        firstName,
        lastName,
        payherePaymentId,
        payhereOrderId,
        seatDetails,
        paymentDetails,
      });

      // Prepare email options
      const mailOptions = {
        from: {
          name: process.env.BREVO_FROM_NAME || "Perahera Gallery",
          address: process.env.BREVO_FROM_EMAIL,
        },
        to: email,
        subject: `Your Perahera Gallery Ticket - Order #${payhereOrderId}`,
        html: htmlContent,
        attachments: [],
      };

      // Add PDF attachment if ticket URL exists
      if (ticketUrl && (await this.fileExists(ticketUrl))) {
        mailOptions.attachments.push({
          filename: `Perahera_Ticket_${payhereOrderId}.pdf`,
          path: ticketUrl,
          contentType: "application/pdf",
        });
      }

      // Send email
      const result = await this.transporter.sendMail(mailOptions);

      console.log("✅ Ticket email sent successfully:", {
        messageId: result.messageId,
        to: email,
        orderId: payhereOrderId,
      });

      return {
        success: true,
        messageId: result.messageId,
        recipient: email,
      };
    } catch (error) {
      console.error("❌ Failed to send ticket email:", error);
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  /**
   * Generate HTML content for ticket email
   */
  generateTicketEmailHTML(data) {
    const {
      firstName,
      lastName,
      payherePaymentId,
      payhereOrderId,
      seatDetails,
      paymentDetails,
    } = data;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Perahera Gallery Ticket</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #FF6B35, #F7931E); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .ticket-info { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .info-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
            .info-label { font-weight: bold; color: #666; }
            .info-value { color: #333; }
            .highlight { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px; }
            .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
            .success-badge { background: #d4edda; color: #155724; padding: 10px 15px; border-radius: 5px; display: inline-block; margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo">🎭 Perahera Gallery</div>
            <h1>Booking Confirmed!</h1>
            <p>Your ticket has been successfully generated</p>
        </div>
        
        <div class="content">
            <div class="success-badge">
                ✅ Payment Successful - Ticket Ready
            </div>
            
            <h2>Dear ${firstName} ${lastName},</h2>
            
            <p>Thank you for your booking! Your payment has been processed successfully and your ticket is now ready.</p>
            
            <div class="ticket-info">
                <h3>🎫 Booking Details</h3>
                <div class="info-row">
                    <span class="info-label">Order ID:</span>
                    <span class="info-value">${payhereOrderId}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Payment ID:</span>
                    <span class="info-value">${payherePaymentId}</span>
                </div>
                ${
                  seatDetails
                    ? `
                <div class="info-row">
                    <span class="info-label">Seat Type:</span>
                    <span class="info-value">${seatDetails.name || "N/A"}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Quantity:</span>
                    <span class="info-value">${
                      seatDetails.quantity || "N/A"
                    }</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Event Date:</span>
                    <span class="info-value">${
                      seatDetails.eventDate || "N/A"
                    }</span>
                </div>
                `
                    : ""
                }
                ${
                  paymentDetails
                    ? `
                <div class="info-row">
                    <span class="info-label">Amount Paid:</span>
                    <span class="info-value">LKR ${
                      paymentDetails.amount || "N/A"
                    }</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Payment Method:</span>
                    <span class="info-value">${
                      paymentDetails.method || "N/A"
                    }</span>
                </div>
                `
                    : ""
                }
            </div>
            
            <div class="highlight">
                <strong>📎 Your Ticket PDF</strong><br>
                Your ticket is attached to this email as a PDF file. Please download and save it for your records. You'll need to present this ticket at the venue.
            </div>
            
            <h3>Important Instructions:</h3>
            <ul>
                <li>🎫 Please bring a printed copy or show the PDF on your mobile device</li>
                <li>🆔 Bring a valid ID that matches the booking details</li>
                <li>⏰ Arrive at least 30 minutes before the event starts</li>
                <li>📧 Keep this email for your records</li>
            </ul>
            
            <p>We look forward to providing you with an unforgettable experience at the Perahera Gallery!</p>
            
            <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
            
            <p>Best regards,<br>
            <strong>The Perahera Gallery Team</strong></p>
        </div>
        
        <div class="footer">
            <p>This is an automated email. Please do not reply directly to this message.</p>
            <p>© ${new Date().getFullYear()} Perahera Gallery. All rights reserved.</p>
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
        subject: "Test Email from Perahera Gallery",
        html: `
          <h2>Email Service Test</h2>
          <p>This is a test email to verify that the Brevo email service is working correctly.</p>
          <p>Sent at: ${new Date().toLocaleString()}</p>
        `,
      };

      const result = await this.transporter.sendMail(mailOptions);

      console.log("✅ Test email sent successfully:", {
        messageId: result.messageId,
        to: toEmail,
      });

      return {
        success: true,
        messageId: result.messageId,
        recipient: toEmail,
      };
    } catch (error) {
      console.error("❌ Test email failed:", error);
      throw new Error(`Test email failed: ${error.message}`);
    }
  }
}

module.exports = new EmailService();
