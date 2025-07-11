// Database migration script to fix card_expiry column size issue
const { query } = require("../config/database-schema");

/**
 * Fix PayHere notification card_expiry column size
 * Issue: Column was VARCHAR(4) but PayHere sends MM/YY format (5 chars with slash)
 * Solution: Increase column size to VARCHAR(10) to safely accommodate various formats
 */
async function fixCardExpiryColumn() {
  console.log("🔧 Starting database migration to fix card_expiry column...");

  try {
    // Check current column definition
    console.log("📋 Checking current card_expiry column definition...");
    const columnInfo = await query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'payment_notifications' 
      AND COLUMN_NAME = 'card_expiry'
    `);

    if (columnInfo.length > 0) {
      console.log(
        `📊 Current card_expiry column: ${columnInfo[0].DATA_TYPE}(${columnInfo[0].CHARACTER_MAXIMUM_LENGTH})`
      );

      if (columnInfo[0].CHARACTER_MAXIMUM_LENGTH < 10) {
        console.log("🔄 Altering card_expiry column to VARCHAR(10)...");

        await query(`
          ALTER TABLE payment_notifications 
          MODIFY COLUMN card_expiry VARCHAR(10) DEFAULT NULL
        `);

        console.log(
          "✅ Successfully altered card_expiry column to VARCHAR(10)"
        );

        // Verify the change
        const updatedColumnInfo = await query(`
          SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'payment_notifications' 
          AND COLUMN_NAME = 'card_expiry'
        `);

        console.log(
          `✅ Verified: card_expiry column is now ${updatedColumnInfo[0].DATA_TYPE}(${updatedColumnInfo[0].CHARACTER_MAXIMUM_LENGTH})`
        );
      } else {
        console.log(
          "✅ card_expiry column is already large enough (>= 10 characters)"
        );
      }
    } else {
      console.log(
        "❌ card_expiry column not found in payment_notifications table"
      );
    }
  } catch (error) {
    console.error("❌ Error during migration:", error);
    throw error;
  }
}

/**
 * Test PayHere notification insertion with fixed column
 */
async function testPayHereNotificationInsertion() {
  console.log("\n🧪 Testing PayHere notification insertion...");

  try {
    const testNotification = {
      payhere_payment_id: "TEST_" + Date.now(),
      payhere_order_id: "TEST_ORDER_" + Date.now(),
      merchant_id: "1230935",
      payhere_amount: "100.00",
      payhere_currency: "LKR",
      status_code: 2,
      status_message: "Test payment successful",
      payment_method: "VISA",
      card_holder_name: "Test User",
      card_no: "************1234",
      card_expiry: "12/28", // This was causing the error
      custom_1: "1",
      custom_2: "1",
      md5sig: "test_signature",
      raw_notification_data: JSON.stringify({ test: true }),
    };

    const result = await query(
      `
      INSERT INTO payment_notifications 
      (payhere_payment_id, payhere_order_id, merchant_id, payhere_amount, 
       payhere_currency, status_code, status_message, payment_method, 
       card_holder_name, card_no, card_expiry, custom_1, custom_2, 
       md5sig, raw_notification_data, received_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `,
      [
        testNotification.payhere_payment_id,
        testNotification.payhere_order_id,
        testNotification.merchant_id,
        testNotification.payhere_amount,
        testNotification.payhere_currency,
        testNotification.status_code,
        testNotification.status_message,
        testNotification.payment_method,
        testNotification.card_holder_name,
        testNotification.card_no,
        testNotification.card_expiry,
        testNotification.custom_1,
        testNotification.custom_2,
        testNotification.md5sig,
        testNotification.raw_notification_data,
      ]
    );

    console.log(
      "✅ Test notification inserted successfully with card_expiry:",
      testNotification.card_expiry
    );

    // Clean up test data
    await query(
      "DELETE FROM payment_notifications WHERE payhere_payment_id = ?",
      [testNotification.payhere_payment_id]
    );
    console.log("🧹 Test data cleaned up");
  } catch (error) {
    console.error("❌ Test insertion failed:", error);
    throw error;
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  try {
    console.log("🚀 Starting PayHere card_expiry column migration...");
    console.log("=====================================");

    await fixCardExpiryColumn();
    await testPayHereNotificationInsertion();

    console.log("\n✅ Migration completed successfully!");
    console.log(
      "📝 PayHere notifications can now handle card expiry formats like MM/YY"
    );

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = {
  fixCardExpiryColumn,
  testPayHereNotificationInsertion,
  runMigration,
};
