// services/qrCodeService.js
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs").promises;

class QRCodeService {
  constructor() {
    this.qrCodesDir = path.join(__dirname, "..", "uploads", "qrcodes");
    this.ensureQRCodesDirectory();
  }

  /**
   * Ensure QR codes directory exists
   */
  async ensureQRCodesDirectory() {
    try {
      await fs.mkdir(this.qrCodesDir, { recursive: true });
      console.log("✅ QR codes directory ensured:", this.qrCodesDir);
    } catch (error) {
      console.error("❌ Failed to create QR codes directory:", error);
    }
  }

  /**
   * Generate QR code for ticket number
   * @param {string} ticketNumber - The unique ticket number
   * @param {object} options - QR code generation options
   * @returns {Promise<object>} QR code generation result
   */ async generateTicketQRCode(ticketNumber, options = {}) {
    try {
      const {
        width = 200,
        margin = 2,
        color = {
          dark: "#000000",
          light: "#FFFFFF",
        },
        errorCorrectionLevel = "M",
      } = options;

      // Create QR code data with ticket number only
      const qrData = ticketNumber;

      // Generate filename
      const filename = `qr_${ticketNumber.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
      const filePath = path.join(this.qrCodesDir, filename);

      // Generate QR code as buffer first
      const qrBuffer = await QRCode.toBuffer(qrData, {
        width,
        margin,
        color,
        errorCorrectionLevel,
        type: "png",
      });

      // Save to file
      await fs.writeFile(filePath, qrBuffer);

      // Generate base64 data URL for embedding in PDF
      const base64Data = qrBuffer.toString("base64");
      const dataUrl = `data:image/png;base64,${base64Data}`;

      console.log("✅ QR code generated successfully:", {
        ticketNumber,
        filename,
        filePath,
        size: `${(qrBuffer.length / 1024).toFixed(2)} KB`,
        data: qrData,
      });

      return {
        success: true,
        filename,
        filePath,
        dataUrl,
        base64Data,
        qrData,
        size: qrBuffer.length,
      };
    } catch (error) {
      console.error("❌ QR code generation failed:", error);
      throw new Error(`QR code generation failed: ${error.message}`);
    }
  }

  /**
   * Generate QR code as base64 string only (no file)
   * @param {string} ticketNumber - The unique ticket number
   * @param {object} options - QR code generation options
   * @returns {Promise<string>} Base64 data URL
   */
  async generateQRCodeBase64Only(ticketNumber, options = {}) {
    try {
      const {
        width = 200,
        margin = 2,
        color = {
          dark: "#000000",
          light: "#FFFFFF",
        },
        errorCorrectionLevel = "M",
      } = options;

      // Create QR code data with ticket number only
      const qrData = ticketNumber;

      // Generate QR code as data URL
      const dataUrl = await QRCode.toDataURL(qrData, {
        width,
        margin,
        color,
        errorCorrectionLevel,
        type: "image/png",
      });

      console.log("✅ QR code base64 generated for ticket:", ticketNumber);

      return dataUrl;
    } catch (error) {
      console.error("❌ QR code base64 generation failed:", error);
      throw new Error(`QR code base64 generation failed: ${error.message}`);
    }
  }
  /**
   * Verify QR code data format
   * @param {string} qrData - QR code data to verify (ticket number)
   * @returns {object} Verification result
   */
  verifyQRCodeData(qrData) {
    try {
      // QR data is now just the ticket number
      const ticketNumber = qrData.trim();

      if (ticketNumber && ticketNumber.length > 0) {
        return {
          valid: true,
          ticketNumber,
        };
      }

      return {
        valid: false,
        error: "Invalid ticket number format",
      };
    } catch (error) {
      return {
        valid: false,
        error: `Invalid ticket number: ${error.message}`,
      };
    }
  }

  /**
   * Clean up old QR code files (optional maintenance function)
   * @param {number} daysOld - Remove files older than this many days
   */
  async cleanupOldQRCodes(daysOld = 30) {
    try {
      const files = await fs.readdir(this.qrCodesDir);
      const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
      let removedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.qrCodesDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          removedCount++;
        }
      }

      console.log(`✅ Cleaned up ${removedCount} old QR code files`);
      return { removedCount };
    } catch (error) {
      console.error("❌ QR code cleanup failed:", error);
      return { error: error.message };
    }
  }
}

module.exports = QRCodeService;
