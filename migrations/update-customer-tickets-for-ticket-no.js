// migrations/update-customer-tickets-for-ticket-no.js
require("dotenv").config();
const { query } = require("../config/database-schema");

async function updateCustomerTicketsTable() {
  try {
    console.log(
      "🔧 Updating customer_tickets table for ticket_no implementation..."
    ); // Step 1: Check if ticket_no column exists before adding it
    console.log("➕ Checking and adding ticket_no column...");

    const columnExists = await query(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'customer_tickets' 
        AND COLUMN_NAME = 'ticket_no'
    `);

    if (columnExists[0].count === 0) {
      await query(`
        ALTER TABLE customer_tickets 
        ADD COLUMN ticket_no VARCHAR(50) UNIQUE 
        COMMENT 'Universal unique ticket number in format PG<ticket_id>-<date>-<unique_number>'
      `);
      console.log("✅ ticket_no column added successfully");
    } else {
      console.log("✅ ticket_no column already exists");
    }

    // Step 2: Check current structure
    const tableStructure = await query("DESCRIBE customer_tickets");
    console.log("📊 Current customer_tickets table structure:");
    tableStructure.forEach((col) => {
      console.log(
        `  - ${col.Field}: ${col.Type} ${
          col.Null === "YES" ? "(NULL)" : "(NOT NULL)"
        }`
      );
    });

    // Step 3: Check if customer_id column exists (to be replaced)
    const customerIdExists = tableStructure.some(
      (col) => col.Field === "customer_id"
    );
    console.log(`📋 customer_id column exists: ${customerIdExists}`);

    // Step 4: Check if checkout_customer_id column exists
    const checkoutCustomerIdExists = tableStructure.some(
      (col) => col.Field === "checkout_customer_id"
    );
    console.log(
      `📋 checkout_customer_id column exists: ${checkoutCustomerIdExists}`
    );

    if (customerIdExists && checkoutCustomerIdExists) {
      console.log(
        "⚠️ Both customer_id and checkout_customer_id exist. Migration needed."
      );
      console.log(
        "📋 This migration will safely update references but keep columns for backward compatibility."
      );
      console.log(
        "📋 Manual removal of customer_id column should be done after thorough testing."
      );
    } // Step 5: Add index for ticket_no if not exists
    try {
      const indexExists = await query(`
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'customer_tickets' 
          AND INDEX_NAME = 'idx_ticket_no'
      `);

      if (indexExists[0].count === 0) {
        await query(`
          ALTER TABLE customer_tickets 
          ADD INDEX idx_ticket_no (ticket_no)
        `);
        console.log("✅ Added index for ticket_no column");
      } else {
        console.log("✅ Index for ticket_no already exists");
      }
    } catch (error) {
      if (error.code === "ER_DUP_KEYNAME") {
        console.log("✅ Index for ticket_no already exists");
      } else {
        throw error;
      }
    }

    console.log("🎉 customer_tickets table update completed successfully!");
    console.log("📋 Summary of changes:");
    console.log("   - ✅ Added ticket_no column (VARCHAR(50) UNIQUE)");
    console.log("   - ✅ Added index for ticket_no");
    console.log(
      "   - 📝 customer_id column preserved for backward compatibility"
    );
    console.log(
      "   - 📝 checkout_customer_id usage should be prioritized in new code"
    );
  } catch (error) {
    console.error("❌ Error updating customer_tickets table:", error);
    throw error;
  }
}

// Run the migration
if (require.main === module) {
  updateCustomerTicketsTable()
    .then(() => {
      console.log("✅ Database migration completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Database migration failed:", error);
      process.exit(1);
    });
}

module.exports = { updateCustomerTicketsTable };
