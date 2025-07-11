// utils/ticketNumberGenerator.js
const crypto = require("crypto");

/**
 * Generate a unique ticket number in format: PG<ticket_id>-<date>-<6digit_unique_number>
 * Example: PG12-230625-123456
 *
 * @param {number} ticketId - The ticket ID from database
 * @returns {string} Formatted ticket number
 */
function generateTicketNumber(ticketId) {
  try {
    // Get current date in YYMMDD format
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); // Last 2 digits of year
    const month = String(now.getMonth() + 1).padStart(2, "0"); // Month (01-12)
    const day = String(now.getDate()).padStart(2, "0"); // Day (01-31)
    const dateStr = `${year}${month}${day}`;

    // Generate 6-digit unique random number
    const randomNumber = crypto.randomInt(100000, 999999); // 6-digit number between 100000-999999

    // Format: PG<ticket_id>-<date>-<unique_number>
    const ticketNumber = `PG${ticketId}-${dateStr}-${randomNumber}`;

    console.log(`✅ Generated ticket number: ${ticketNumber}`, {
      ticketId,
      date: dateStr,
      randomNumber,
      fullFormat: ticketNumber,
    });

    return ticketNumber;
  } catch (error) {
    console.error("❌ Error generating ticket number:", error);
    throw new Error(`Failed to generate ticket number: ${error.message}`);
  }
}

/**
 * Generate a shared ticket number for a group based on shop, day, and event date
 * This ensures all records in the same group share the same ticket number
 *
 * @param {number} shopId - The shop ID
 * @param {number} dayId - The day ID
 * @param {string} eventDate - The event date (YYYY-MM-DD format)
 * @returns {string} Formatted shared ticket number
 */
function generateSharedTicketNumber(shopId, dayId, eventDate) {
  try {
    console.log(`🎯 Generating shared ticket number for group:`, {
      shopId,
      dayId,
      eventDate,
    });

    // Parse event date or use current date
    let dateObj;
    if (eventDate) {
      dateObj = new Date(eventDate);
    } else {
      dateObj = new Date();
    }

    // Get date in YYMMDD format
    const year = dateObj.getFullYear().toString().slice(-2); // Last 2 digits of year
    const month = String(dateObj.getMonth() + 1).padStart(2, "0"); // Month (01-12)
    const day = String(dateObj.getDate()).padStart(2, "0"); // Day (01-31)
    const dateStr = `${year}${month}${day}`;

    // Create a deterministic hash based on shop, day, and date to ensure consistency
    const groupKey = `${shopId}_${dayId}_${dateStr}`;
    const hash = crypto.createHash("md5").update(groupKey).digest("hex");

    // Take first 6 characters of hash and convert to number (ensure it's 6 digits)
    const hashNumber = (parseInt(hash.substring(0, 6), 16) % 900000) + 100000;

    // Format: PGS<shop_id>D<day_id>-<date>-<hash_number>
    const sharedTicketNumber = `PGS${shopId}D${dayId}-${dateStr}-${hashNumber}`;

    console.log(`✅ Generated shared ticket number: ${sharedTicketNumber}`, {
      shopId,
      dayId,
      eventDate,
      dateStr,
      groupKey,
      hashNumber,
      fullFormat: sharedTicketNumber,
    });

    return sharedTicketNumber;
  } catch (error) {
    console.error("❌ Error generating shared ticket number:", error);
    throw new Error(
      `Failed to generate shared ticket number: ${error.message}`
    );
  }
}

/**
 * Validate ticket number format (supports both individual and shared formats)
 * @param {string} ticketNumber - Ticket number to validate
 * @returns {boolean} True if valid format
 */
function validateTicketNumber(ticketNumber) {
  // Pattern for individual tickets: PG<digits>-<6digits>-<6digits>
  const individualPattern = /^PG\d+-\d{6}-\d{6}$/;
  // Pattern for shared tickets: PGS<digits>D<digits>-<6digits>-<6digits>
  const sharedPattern = /^PGS\d+D\d+-\d{6}-\d{6}$/;

  const isValid =
    individualPattern.test(ticketNumber) || sharedPattern.test(ticketNumber);

  console.log(
    `🔍 Validating ticket number: ${ticketNumber} - ${
      isValid ? "Valid" : "Invalid"
    }`
  );

  return isValid;
}

/**
 * Parse ticket number to extract components (supports both individual and shared formats)
 * @param {string} ticketNumber - Ticket number to parse
 * @returns {object} Parsed components or null if invalid
 */
function parseTicketNumber(ticketNumber) {
  if (!validateTicketNumber(ticketNumber)) {
    console.log(`❌ Invalid ticket number format: ${ticketNumber}`);
    return null;
  }

  try {
    const parts = ticketNumber.split("-");
    const date = parts[1];
    const uniqueNumber = parts[2];

    let result = {
      date,
      uniqueNumber,
      year: "20" + date.slice(0, 2),
      month: date.slice(2, 4),
      day: date.slice(4, 6),
    };

    // Check if it's a shared ticket number (starts with PGS)
    if (ticketNumber.startsWith("PGS")) {
      // Format: PGS<shop_id>D<day_id>-<date>-<unique_number>
      const prefixPart = parts[0]; // PGS<shop_id>D<day_id>
      const shopDayMatch = prefixPart.match(/^PGS(\d+)D(\d+)$/);

      if (shopDayMatch) {
        result.type = "shared";
        result.shopId = parseInt(shopDayMatch[1]);
        result.dayId = parseInt(shopDayMatch[2]);

        console.log(`📋 Parsed shared ticket number:`, result);
      }
    } else {
      // Individual ticket format: PG<ticket_id>-<date>-<unique_number>
      const ticketId = parseInt(parts[0].replace("PG", ""));
      result.type = "individual";
      result.ticketId = ticketId;

      console.log(`📋 Parsed individual ticket number:`, result);
    }

    return result;
  } catch (error) {
    console.error("❌ Error parsing ticket number:", error);
    return null;
  }
}

module.exports = {
  generateTicketNumber,
  generateSharedTicketNumber,
  validateTicketNumber,
  parseTicketNumber,
};
