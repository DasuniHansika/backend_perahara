// Updated database configuration with cart table (clean version without sample data)
require("dotenv").config();
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const SALT_ROUNDS = 10;

// Create connection pool (without database specified for initial setup)
const createConnectionPool = (includeDatabase = false) => {
  const config = {
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
    timezone: "+05:30", // Asia/Colombo timezone
  };

  if (includeDatabase) {
    config.database = process.env.DB_NAME || "perahera_gallery";
  }

  return mysql.createPool(config);
};

// Initial pool for database creation (without database specified)
let pool = createConnectionPool(false);

const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};

// Define SQL queries for each table creation
const createTableQueries = {
  // 1. Create Database (if not exists) and Use It
  createDatabase: `
    CREATE DATABASE IF NOT EXISTS \`${
      process.env.DB_NAME || "perahera_gallery"
    }\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    USE \`${process.env.DB_NAME || "perahera_gallery"}\`;
  `,

  // 2. Users Table
  usersTable: `
    CREATE TABLE IF NOT EXISTS \`users\` (
      \`user_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`firebase_uid\` VARCHAR(128) NOT NULL UNIQUE,
      \`username\` VARCHAR(50) NOT NULL UNIQUE,
      \`email\` VARCHAR(100) DEFAULT NULL,
      \`role\` ENUM('super_admin','admin','seller','customer') NOT NULL,
      \`mobile_number\` VARCHAR(15) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`created_by\` INT UNSIGNED DEFAULT NULL,
      PRIMARY KEY (\`user_id\`),
      INDEX \`idx_users_role\` (\`role\`),
      INDEX \`idx_users_created_by\` (\`created_by\`),
      CONSTRAINT \`fk_users_created_by\`
        FOREIGN KEY (\`created_by\`)
        REFERENCES \`users\`(\`user_id\`)
        ON DELETE SET NULL
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='All application users; created_by = who registered them (admin/super_admin)';
  `,
  
  // 3. Customers Table
  customersTable: `    
    CREATE TABLE IF NOT EXISTS \`customers\` (
      \`customer_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`user_id\` INT UNSIGNED NOT NULL UNIQUE,
      \`first_name\` VARCHAR(50) NOT NULL,
      \`last_name\` VARCHAR(50) NOT NULL,
      \`profile_picture\` VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (\`customer_id\`),
      CONSTRAINT \`fk_customers_user\`
        FOREIGN KEY (\`user_id\`)
        REFERENCES \`users\`(\`user_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Stores first/last name for users with role=customer';
  `,

  // 4. Sellers Table
  sellersTable: `
    CREATE TABLE IF NOT EXISTS \`sellers\` (
      \`seller_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`user_id\` INT UNSIGNED NOT NULL UNIQUE,
      \`first_name\` VARCHAR(50) NOT NULL,
      \`last_name\` VARCHAR(50) NOT NULL,
      \`nic\` VARCHAR(20) NOT NULL,
      \`bank_account_number\` VARCHAR(30) NOT NULL,
      \`bank_name\` VARCHAR(50) NOT NULL,
      \`branch_name\` VARCHAR(50) NOT NULL,
      \`profile_picture\` VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (\`seller_id\`),
      CONSTRAINT \`fk_sellers_user\`
        FOREIGN KEY (\`user_id\`)
        REFERENCES \`users\`(\`user_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Stores NIC, bank info, etc. for users with role=seller';
  `,

  // 5. Admins Table
  adminsTable: `
    CREATE TABLE IF NOT EXISTS \`admins\` (
      \`admin_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`user_id\` INT UNSIGNED NOT NULL UNIQUE,
      PRIMARY KEY (\`admin_id\`),
      CONSTRAINT \`fk_admins_user\`
        FOREIGN KEY (\`user_id\`)
        REFERENCES \`users\`(\`user_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Links to users with role=admin or role=super_admin';
  `,

  // 6. Shops Table
  shopsTable: `    
    CREATE TABLE IF NOT EXISTS \`shops\` (
      \`shop_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`seller_id\` INT UNSIGNED NOT NULL,
      \`name\` VARCHAR(100) NOT NULL,
      \`street\` VARCHAR(100) DEFAULT NULL,
      \`latitude\` DECIMAL(13,10) NOT NULL,
      \`longitude\` DECIMAL(13,10) NOT NULL,
      \`image1\` VARCHAR(255) DEFAULT NULL,
      \`image2\` VARCHAR(255) DEFAULT NULL,
      \`image3\` VARCHAR(255) DEFAULT NULL,
      \`image4\` VARCHAR(255) DEFAULT NULL,
      \`description\` TEXT DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`shop_id\`),
      INDEX \`idx_shops_seller\` (\`seller_id\`),
      CONSTRAINT \`fk_shops_seller\`
        FOREIGN KEY (\`seller_id\`)
        REFERENCES \`sellers\`(\`seller_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Stores shop details (coordinates + images) belonging to a seller';
  `,
  
  // 7. Procession Days Table
  processionDaysTable: `
    CREATE TABLE IF NOT EXISTS \`procession_days\` (
      \`day_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`date\` DATE NOT NULL,
      \`event_name\` VARCHAR(100) NULL,
      \`description\` TEXT NULL,
      \`color\` VARCHAR(7) DEFAULT NULL COMMENT 'Hex color code for the day (e.g., #FF5733)',
      PRIMARY KEY (\`day_id\`),
      UNIQUE KEY \`uq_procession_days_date\` (\`date\`)
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Each procession date (unique) with event name and description';
  `,

  // 8. Procession Routes Table
  processionRoutesTable: `
    CREATE TABLE IF NOT EXISTS \`procession_routes\` (
      \`route_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`day_id\` INT UNSIGNED NOT NULL,
      \`latitude\` DECIMAL(13,10) NOT NULL,
      \`longitude\` DECIMAL(13,10) NOT NULL,
      \`sequence\` INT NOT NULL,
      PRIMARY KEY (\`route_id\`),
      INDEX \`idx_routes_day\` (\`day_id\`),
      CONSTRAINT \`fk_routes_day\`
        FOREIGN KEY (\`day_id\`)
        REFERENCES \`procession_days\`(\`day_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Geo-coordinates for each day''s route, ordered by sequence';
  `,

  // 9. Seat Types Table
  seatTypesTable: `
    CREATE TABLE IF NOT EXISTS \`seat_types\` (
      \`seat_type_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`shop_id\` INT UNSIGNED NOT NULL,
      \`name\` VARCHAR(100) NOT NULL,
      \`image_url\` VARCHAR(255) DEFAULT NULL,
      \`description\` TEXT DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`seat_type_id\`),
      INDEX \`idx_seat_types_shop\` (\`shop_id\`),
      CONSTRAINT \`fk_seat_types_shop\`
        FOREIGN KEY (\`shop_id\`)
        REFERENCES \`shops\`(\`shop_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Seat categories defined by seller for each shop';
  `,

  // 10. Seat Type Availability Table (NEW - replaces shop_availability and shop_seats)
  seatTypeAvailabilityTable: `
    CREATE TABLE IF NOT EXISTS \`seat_type_availability\` (
      \`availability_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`seat_type_id\` INT UNSIGNED NOT NULL,
      \`day_id\` INT UNSIGNED NOT NULL,
      \`price\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`quantity\` INT NOT NULL DEFAULT 0,
      \`available\` BOOLEAN NOT NULL DEFAULT TRUE,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`availability_id\`),
      UNIQUE KEY \`uq_seat_type_day\` (\`seat_type_id\`,\`day_id\`),
      INDEX \`idx_avail_seat_type\` (\`seat_type_id\`),
      INDEX \`idx_avail_day\` (\`day_id\`),
      CONSTRAINT \`fk_availability_seat_type\`
        FOREIGN KEY (\`seat_type_id\`)
        REFERENCES \`seat_types\`(\`seat_type_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_availability_day\`
        FOREIGN KEY (\`day_id\`)
        REFERENCES \`procession_days\`(\`day_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Links seat types with procession days and stores per-date price and quantity';
  `,

  // 11. Cart Items Table (NEW)
  cartItemsTable: `
    CREATE TABLE IF NOT EXISTS \`cart_items\` (
      \`cart_item_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`customer_id\` INT UNSIGNED NOT NULL,
      \`shop_id\` INT UNSIGNED NOT NULL,
      \`seat_type_id\` INT UNSIGNED NOT NULL,
      \`day_id\` INT UNSIGNED NOT NULL,
      \`quantity\` INT NOT NULL DEFAULT 1,
      \`price_per_seat\` DECIMAL(10,2) NOT NULL,
      \`total_price\` DECIMAL(10,2) NOT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      \`expires_at\` DATETIME NULL DEFAULT NULL,
      PRIMARY KEY (\`cart_item_id\`),
      UNIQUE KEY \`uq_cart_customer_shop_seat_day\` (\`customer_id\`, \`shop_id\`, \`seat_type_id\`, \`day_id\`),
      INDEX \`idx_cart_customer\` (\`customer_id\`),
      INDEX \`idx_cart_shop\` (\`shop_id\`),
      INDEX \`idx_cart_seat_type\` (\`seat_type_id\`),
      INDEX \`idx_cart_day\` (\`day_id\`),
      INDEX \`idx_cart_expires\` (\`expires_at\`),
      CONSTRAINT \`fk_cart_items_user\`
        FOREIGN KEY (\`customer_id\`)
        REFERENCES \`users\`(\`user_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_cart_shop\`
        FOREIGN KEY (\`shop_id\`)
        REFERENCES \`shops\`(\`shop_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_cart_seat_type\`
        FOREIGN KEY (\`seat_type_id\`)
        REFERENCES \`seat_types\`(\`seat_type_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_cart_day\`
        FOREIGN KEY (\`day_id\`)
        REFERENCES \`procession_days\`(\`day_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Shopping cart items for customers before checkout';
  `,
  
  // 12. Bookings Table
  bookingsTable: `    
    CREATE TABLE IF NOT EXISTS \`bookings\` (
      \`booking_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`customer_id\` INT UNSIGNED NOT NULL,
      \`shop_id\` INT UNSIGNED NOT NULL,
      \`seat_type_id\` INT UNSIGNED NOT NULL,
      \`day_id\` INT UNSIGNED NOT NULL,
      \`quantity\` INT NOT NULL,
      \`total_price\` DECIMAL(10,2) NOT NULL,
      \`status\` ENUM('pending', 'confirmed', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      \`expires_at\` TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (\`booking_id\`),
      INDEX \`idx_bookings_customer\` (\`customer_id\`),
      INDEX \`idx_bookings_shop\` (\`shop_id\`),
      INDEX \`idx_bookings_seat_type\` (\`seat_type_id\`),
      INDEX \`idx_bookings_day\` (\`day_id\`),
      INDEX \`idx_bookings_expires_at\` (\`expires_at\`),
      INDEX \`idx_bookings_status\` (\`status\`),
      CONSTRAINT \`fk_bookings_user\`
        FOREIGN KEY (\`customer_id\`)
        REFERENCES \`users\`(\`user_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_bookings_shop\`
        FOREIGN KEY (\`shop_id\`)
        REFERENCES \`shops\`(\`shop_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_bookings_seat_type\`
        FOREIGN KEY (\`seat_type_id\`)
        REFERENCES \`seat_types\`(\`seat_type_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_bookings_day\`
        FOREIGN KEY (\`day_id\`)
        REFERENCES \`procession_days\`(\`day_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Each booking by a customer for a given day/shop/seat type with expiration tracking';
  `,
  
  // 13. Payments Table
  paymentsTable: `
    CREATE TABLE IF NOT EXISTS \`payments\` (
      \`payment_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`booking_id\` INT UNSIGNED NOT NULL,
      \`amount\` DECIMAL(10,2) NOT NULL,
      \`payment_method\` VARCHAR(50) DEFAULT NULL,
      \`status\` ENUM('pending', 'success', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
      \`payhere_payment_id\` VARCHAR(255) DEFAULT NULL,
      \`payhere_order_id\` VARCHAR(255) DEFAULT NULL,
      \`expires_at\` DATETIME DEFAULT NULL COMMENT 'When this payment expires and should be cancelled',
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`payment_id\`),
      UNIQUE KEY \`uq_payments_booking\` (\`booking_id\`),
      INDEX \`idx_payments_booking\` (\`booking_id\`),
      INDEX \`idx_payments_status\` (\`status\`),
      INDEX \`idx_payments_expires_at\` (\`expires_at\`),
      INDEX \`idx_payments_payhere_payment_id\` (\`payhere_payment_id\`),
      INDEX \`idx_payments_payhere_order_id\` (\`payhere_order_id\`),
      CONSTRAINT \`fk_payments_booking\`
        FOREIGN KEY (\`booking_id\`)
        REFERENCES \`bookings\`(\`booking_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Ties one payment to one booking; supports multiple bookings per payhere order';  
  `,

  // 14. Payment Notifications Table
  paymentNotificationsTable: `
    CREATE TABLE IF NOT EXISTS \`payment_notifications\` (
      \`notification_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`payhere_payment_id\` VARCHAR(255) DEFAULT NULL,
      \`payhere_order_id\` VARCHAR(255) DEFAULT NULL,
      \`merchant_id\` VARCHAR(50) DEFAULT NULL,
      \`payhere_amount\` DECIMAL(10,2) DEFAULT NULL,      
      \`payhere_currency\` VARCHAR(3) DEFAULT NULL,
      \`status_code\` INT DEFAULT NULL,
      \`status_message\` TEXT DEFAULT NULL,
      \`payment_method\` VARCHAR(50) DEFAULT NULL,
      \`card_holder_name\` VARCHAR(255) DEFAULT NULL,
      \`card_no\` VARCHAR(20) DEFAULT NULL,
      \`card_expiry\` VARCHAR(10) DEFAULT NULL,
      \`custom_1\` VARCHAR(255) DEFAULT NULL,
      \`custom_2\` VARCHAR(255) DEFAULT NULL,
      \`md5sig\` VARCHAR(32) DEFAULT NULL,
      \`md5sig_verified\` BOOLEAN DEFAULT FALSE,
      \`raw_notification_data\` JSON DEFAULT NULL,
      \`processing_status\` ENUM('pending', 'processed', 'failed') DEFAULT 'pending',
      \`error_message\` TEXT DEFAULT NULL,
      \`received_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`processed_at\` TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (\`notification_id\`),
      INDEX \`idx_payhere_payment_id\` (\`payhere_payment_id\`),
      INDEX \`idx_payhere_order_id\` (\`payhere_order_id\`),
      INDEX \`idx_received_at\` (\`received_at\`)
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Stores PayHere payment notifications and processing status';
  `,

  // 15. Activity Logs Table
  activityLogsTable: `
    CREATE TABLE IF NOT EXISTS \`activity_logs\` (
      \`log_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`user_id\` INT UNSIGNED NOT NULL,
      \`role\` ENUM('super_admin','admin','seller','customer') NOT NULL,
      \`action_type\` VARCHAR(100) NOT NULL,
      \`description\` TEXT DEFAULT NULL,
      \`affected_entity_id\` INT UNSIGNED DEFAULT NULL,
      \`entity_type\` VARCHAR(50) DEFAULT NULL,
      \`timestamp\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`log_id\`),
      INDEX \`idx_activity_logs_user\` (\`user_id\`),
      INDEX \`idx_activity_logs_role\` (\`role\`),
      CONSTRAINT \`fk_activity_logs_user\`
        FOREIGN KEY (\`user_id\`)
        REFERENCES \`users\`(\`user_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB      
      DEFAULT CHARSET=utf8mb4      
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Audit trail: logs registrations, logins, bookings, payments, updates, etc.';
  `,

  // Checkout Customers Table - New table for storing customer details from checkout form
  checkoutCustomersTable: `
    CREATE TABLE IF NOT EXISTS \`checkout_customers\` (
      \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`payhere_order_id\` VARCHAR(255) NOT NULL,
      \`first_name\` VARCHAR(100) NOT NULL,
      \`last_name\` VARCHAR(100) NOT NULL,
      \`email\` VARCHAR(255) NOT NULL,
      \`phone\` VARCHAR(20) DEFAULT NULL,
      \`country\` VARCHAR(100) DEFAULT NULL,
      \`status\` ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_checkout_customers_payhere_order\` (\`payhere_order_id\`),
      INDEX \`idx_checkout_customers_payhere_order\` (\`payhere_order_id\`),
      INDEX \`idx_checkout_customers_status\` (\`status\`),
      INDEX \`idx_checkout_customers_email\` (\`email\`)
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Stores customer details from checkout form for payment processing and ticket generation';  
  `, 
  
  // Customer Tickets Table - Updated structure to reference checkout_customers
  customerTicketsTable: `
    CREATE TABLE IF NOT EXISTS \`customer_tickets\` (
      \`ticket_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`account_owner_id\` INT UNSIGNED DEFAULT NULL COMMENT 'References users.user_id for account ownership',
      \`checkout_customer_id\` INT UNSIGNED DEFAULT NULL COMMENT 'References checkout_customers.id',
      \`shop_id\` INT UNSIGNED DEFAULT NULL COMMENT 'References shops.shop_id for ticket shop relationship',
      \`booking_id\` INT UNSIGNED DEFAULT NULL COMMENT 'References bookings.booking_id for ticket booking relationship',
      \`day_id\` INT UNSIGNED DEFAULT NULL COMMENT 'References procession_days.day_id for event day',
      \`ticket_no\` VARCHAR(50) DEFAULT NULL COMMENT 'Universal unique ticket number in format PG<ticket_id>-<date>-<unique_number>',
      \`payhere_payment_id\` VARCHAR(255) DEFAULT NULL,
      \`payhere_order_id\` VARCHAR(255) DEFAULT NULL,
      \`ticket_url\` VARCHAR(500) DEFAULT NULL,
      \`qrcode_url\` VARCHAR(500) DEFAULT NULL COMMENT 'URL to the QR code image file',
      \`shop_info\` JSON DEFAULT NULL COMMENT 'Shop information for multi-shop tickets',
      \`booking_info\` JSON DEFAULT NULL COMMENT 'Booking details for multi-shop tickets',
      \`used\` VARCHAR(3) NOT NULL DEFAULT 'no' COMMENT 'Ticket usage status - yes or no' CHECK (\`used\` IN ('yes', 'no')),
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`ticket_id\`),
      INDEX \`idx_customer_tickets_account_owner\` (\`account_owner_id\`),
      INDEX \`idx_customer_tickets_checkout_customer\` (\`checkout_customer_id\`),
      INDEX \`idx_customer_tickets_shop\` (\`shop_id\`),
      INDEX \`idx_customer_tickets_booking\` (\`booking_id\`),
      INDEX \`idx_customer_tickets_day\` (\`day_id\`),
      INDEX \`idx_customer_tickets_ticket_no\` (\`ticket_no\`),
      INDEX \`idx_customer_tickets_payhere_payment\` (\`payhere_payment_id\`),
      INDEX \`idx_customer_tickets_payhere_order\` (\`payhere_order_id\`),
      CONSTRAINT \`fk_customer_tickets_account_owner\`
        FOREIGN KEY (\`account_owner_id\`)
        REFERENCES \`users\`(\`user_id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_customer_tickets_checkout_customer\`
        FOREIGN KEY (\`checkout_customer_id\`)
        REFERENCES \`checkout_customers\`(\`id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_customer_tickets_shop\`
        FOREIGN KEY (\`shop_id\`)
        REFERENCES \`shops\`(\`shop_id\`)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_customer_tickets_booking\`
        FOREIGN KEY (\`booking_id\`)
        REFERENCES \`bookings\`(\`booking_id\`)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
      CONSTRAINT \`fk_customer_tickets_day\`
        FOREIGN KEY (\`day_id\`)
        REFERENCES \`procession_days\`(\`day_id\`)
        ON DELETE SET NULL
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Stores customer ticket information with PDF URLs, payment details, and booking relationships';
  `, 
  
  // Update existing customer_tickets table to migrate to new structure
  updateCustomerTicketsTable: `
    -- Check and add account_owner_id column if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'account_owner_id') = 0,
        'ALTER TABLE customer_tickets ADD COLUMN account_owner_id INT UNSIGNED AFTER customer_id',
        'SELECT "Column account_owner_id already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Check and add checkout_customer_id column if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'checkout_customer_id') = 0,
        'ALTER TABLE customer_tickets ADD COLUMN checkout_customer_id INT UNSIGNED AFTER account_owner_id',
        'SELECT "Column checkout_customer_id already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Check and add ticket_no column if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'ticket_no') = 0,
        'ALTER TABLE customer_tickets ADD COLUMN ticket_no VARCHAR(50) DEFAULT NULL COMMENT "Universal unique ticket number in format PG<ticket_id>-<date>-<unique_number>" AFTER checkout_customer_id',
        'SELECT "Column ticket_no already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Note: Unique constraint on ticket_no intentionally removed for shared tickets
    -- Multiple customer_tickets records can now share the same ticket_no for same PDF
    SET @sql = 'SELECT "Unique constraint on ticket_no intentionally removed for shared tickets"';
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add index for ticket_no if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND index_name = 'idx_customer_tickets_ticket_no') = 0,
        'ALTER TABLE customer_tickets ADD INDEX idx_customer_tickets_ticket_no (ticket_no)',
        'SELECT "Index idx_customer_tickets_ticket_no already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;    
    -- Migrate existing customer_id values to account_owner_id where account_owner_id is null
    UPDATE customer_tickets 
    SET account_owner_id = customer_id 
    WHERE account_owner_id IS NULL AND customer_id IS NOT NULL;

    -- Remove old customer detail columns if they exist (these are now in checkout_customers table)
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'first_name') > 0,
        'ALTER TABLE customer_tickets DROP COLUMN first_name',
        'SELECT "Column first_name does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'last_name') > 0,
        'ALTER TABLE customer_tickets DROP COLUMN last_name',
        'SELECT "Column last_name does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'email') > 0,
        'ALTER TABLE customer_tickets DROP COLUMN email',
        'SELECT "Column email does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'phone') > 0,
        'ALTER TABLE customer_tickets DROP COLUMN phone',
        'SELECT "Column phone does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;    
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'country') > 0,
        'ALTER TABLE customer_tickets DROP COLUMN country',
        'SELECT "Column country does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Migrate remaining customer_id data to checkout_customer_id if needed
    UPDATE customer_tickets 
    SET checkout_customer_id = customer_id 
    WHERE checkout_customer_id IS NULL AND customer_id IS NOT NULL;

    -- Remove legacy customer_id column and related constraints
    -- Drop foreign key constraint if exists
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND constraint_name = 'fk_customer_tickets_customer') > 0,
        'ALTER TABLE customer_tickets DROP FOREIGN KEY fk_customer_tickets_customer',
        'SELECT "Foreign key fk_customer_tickets_customer does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Drop index if exists
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND index_name = 'idx_customer_tickets_customer') > 0,
        'ALTER TABLE customer_tickets DROP INDEX idx_customer_tickets_customer',
        'SELECT "Index idx_customer_tickets_customer does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Drop customer_id column if exists
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'customer_id') > 0,
        'ALTER TABLE customer_tickets DROP COLUMN customer_id',
        'SELECT "Column customer_id does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add foreign key constraint for account_owner_id if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND constraint_name = 'fk_customer_tickets_account_owner') = 0,
        'ALTER TABLE customer_tickets ADD CONSTRAINT fk_customer_tickets_account_owner FOREIGN KEY (account_owner_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE',
        'SELECT "Foreign key fk_customer_tickets_account_owner already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  `,
  
  // Ticket Number System Migration - adds ticket_no column and related indexes
  ticketNumberSystemMigration: `
    -- Ensure we're using the correct database
    USE \`${process.env.DB_NAME || "perahera_gallery"}\`;

    -- Add ticket_no column if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'ticket_no') = 0,
        'ALTER TABLE customer_tickets ADD COLUMN ticket_no VARCHAR(50) DEFAULT NULL COMMENT "Universal unique ticket number in format PG<ticket_id>-<date>-<unique_number>" AFTER checkout_customer_id',
        'SELECT "Column ticket_no already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Note: Unique constraint on ticket_no intentionally removed for shared tickets
    -- Multiple customer_tickets records can now share the same ticket_no for same PDF
    SET @sql = 'SELECT "Unique constraint on ticket_no intentionally removed for shared tickets"';
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add index for ticket_no if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND index_name = 'idx_customer_tickets_ticket_no') = 0,
        'ALTER TABLE customer_tickets ADD INDEX idx_customer_tickets_ticket_no (ticket_no)',
        'SELECT "Index idx_customer_tickets_ticket_no already exists"'
    ));    
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  `,

  // Remove Legacy customer_id Column Migration - safely removes deprecated customer_id column
  removeCustomerIdColumnMigration: `
    -- Ensure we're using the correct database
    USE \`${process.env.DB_NAME || "perahera_gallery"}\`;

    -- Step 1: Migrate any remaining customer_id data to checkout_customer_id if checkout_customer_id is null
    UPDATE customer_tickets 
    SET checkout_customer_id = customer_id 
    WHERE checkout_customer_id IS NULL AND customer_id IS NOT NULL;

    -- Step 2: Drop the foreign key constraint for customer_id if it exists
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND constraint_name = 'fk_customer_tickets_customer') > 0,
        'ALTER TABLE customer_tickets DROP FOREIGN KEY fk_customer_tickets_customer',
        'SELECT "Foreign key fk_customer_tickets_customer does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Step 3: Drop the index for customer_id if it exists
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND index_name = 'idx_customer_tickets_customer') > 0,
        'ALTER TABLE customer_tickets DROP INDEX idx_customer_tickets_customer',
        'SELECT "Index idx_customer_tickets_customer does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Step 4: Drop the customer_id column if it exists
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'customer_id') > 0,
        'ALTER TABLE customer_tickets DROP COLUMN customer_id',
        'SELECT "Column customer_id does not exist"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  `,

  // New Database Updates Migration - adds qrcode_url field to customer_tickets
  newFieldsMigration: `
    -- Ensure we're using the correct database
    USE \`${process.env.DB_NAME || "perahera_gallery"}\`;

    -- Add qrcode_url column to customer_tickets if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'qrcode_url') = 0,
        'ALTER TABLE customer_tickets ADD COLUMN qrcode_url VARCHAR(500) DEFAULT NULL COMMENT "URL to the QR code image file" AFTER ticket_url',
        'SELECT "Column qrcode_url already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add color column to procession_days if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'procession_days' 
         AND table_schema = DATABASE() 
         AND column_name = 'color') = 0,
        'ALTER TABLE procession_days ADD COLUMN color VARCHAR(7) DEFAULT NULL COMMENT "Hex color code for the day (e.g., #FF5733)" AFTER description',
        'SELECT "Column color already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add expires_at column to payments if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'payments' 
         AND table_schema = DATABASE() 
         AND column_name = 'expires_at') = 0,
        'ALTER TABLE payments ADD COLUMN expires_at DATETIME DEFAULT NULL COMMENT "When this payment expires and should be cancelled" AFTER payhere_order_id',
        'SELECT "Column expires_at already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add index for expires_at if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE table_name = 'payments' 
         AND table_schema = DATABASE() 
         AND index_name = 'idx_payments_expires_at') = 0,
        'ALTER TABLE payments ADD INDEX idx_payments_expires_at (expires_at)',
        'SELECT "Index idx_payments_expires_at already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  `,

  // Customer Tickets Foreign Key Migration - adds foreign key constraint for account_owner_id
  customerTicketsForeignKeyMigration: `
    -- Ensure we're using the correct database
    USE \`${process.env.DB_NAME || "perahera_gallery"}\`;

    -- Add foreign key constraint for account_owner_id if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND constraint_name = 'fk_customer_tickets_account_owner') = 0,
        'ALTER TABLE customer_tickets ADD CONSTRAINT fk_customer_tickets_account_owner FOREIGN KEY (account_owner_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE',
        'SELECT "Foreign key fk_customer_tickets_account_owner already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  `,

  // Customer Tickets Additional Fields Migration - adds shop_id, booking_id, day_id foreign keys
  customerTicketsAdditionalFieldsMigration: `
    -- Ensure we're using the correct database
    USE \`${process.env.DB_NAME || "perahera_gallery"}\`;

    -- Add shop_id column if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'shop_id') = 0,
        'ALTER TABLE customer_tickets ADD COLUMN shop_id INT UNSIGNED DEFAULT NULL COMMENT "References shops.shop_id for ticket shop relationship" AFTER checkout_customer_id',
        'SELECT "Column shop_id already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add booking_id column if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'booking_id') = 0,
        'ALTER TABLE customer_tickets ADD COLUMN booking_id INT UNSIGNED DEFAULT NULL COMMENT "References bookings.booking_id for ticket booking relationship" AFTER shop_id',
        'SELECT "Column booking_id already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add day_id column if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'day_id') = 0,
        'ALTER TABLE customer_tickets ADD COLUMN day_id INT UNSIGNED DEFAULT NULL COMMENT "References procession_days.day_id for event day" AFTER booking_id',
        'SELECT "Column day_id already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add indexes for new columns
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND index_name = 'idx_customer_tickets_shop') = 0,
        'ALTER TABLE customer_tickets ADD INDEX idx_customer_tickets_shop (shop_id)',
        'SELECT "Index idx_customer_tickets_shop already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND index_name = 'idx_customer_tickets_booking') = 0,
        'ALTER TABLE customer_tickets ADD INDEX idx_customer_tickets_booking (booking_id)',
        'SELECT "Index idx_customer_tickets_booking already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND index_name = 'idx_customer_tickets_day') = 0,
        'ALTER TABLE customer_tickets ADD INDEX idx_customer_tickets_day (day_id)',
        'SELECT "Index idx_customer_tickets_day already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add foreign key constraints for new columns
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND constraint_name = 'fk_customer_tickets_shop') = 0,
        'ALTER TABLE customer_tickets ADD CONSTRAINT fk_customer_tickets_shop FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE SET NULL ON UPDATE CASCADE',
        'SELECT "Foreign key fk_customer_tickets_shop already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND constraint_name = 'fk_customer_tickets_booking') = 0,
        'ALTER TABLE customer_tickets ADD CONSTRAINT fk_customer_tickets_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL ON UPDATE CASCADE',
        'SELECT "Foreign key fk_customer_tickets_booking already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND constraint_name = 'fk_customer_tickets_day') = 0,
        'ALTER TABLE customer_tickets ADD CONSTRAINT fk_customer_tickets_day FOREIGN KEY (day_id) REFERENCES procession_days(day_id) ON DELETE SET NULL ON UPDATE CASCADE',
        'SELECT "Foreign key fk_customer_tickets_day already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  `,

  // Migration to add 'used' field to customer_tickets table
  addUsedFieldMigration: `
    -- Ensure we're using the correct database
    USE \`${process.env.DB_NAME || "perahera_gallery"}\`;

    -- Add 'used' column if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND column_name = 'used') = 0,
        'ALTER TABLE customer_tickets ADD COLUMN used VARCHAR(3) NOT NULL DEFAULT "no" COMMENT "Ticket usage status - yes or no" AFTER booking_info',
        'SELECT "Column used already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add check constraint for 'used' field if it doesn't exist
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND constraint_name LIKE '%used%') = 0,
        'ALTER TABLE customer_tickets ADD CONSTRAINT chk_customer_tickets_used CHECK (used IN ("yes", "no"))',
        'SELECT "Check constraint for used field already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Add index for 'used' field for better query performance
    SET @sql = (SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE table_name = 'customer_tickets' 
         AND table_schema = DATABASE() 
         AND index_name = 'idx_customer_tickets_used') = 0,
        'ALTER TABLE customer_tickets ADD INDEX idx_customer_tickets_used (used)',
        'SELECT "Index idx_customer_tickets_used already exists"'
    ));
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  `,

  // Add procession days and routes data
  addProcessionDaysAndRoutes: `
    -- Insert procession days
    INSERT INTO procession_days (date, event_name, description, color) VALUES
      ('2025-07-30', '1st Kumbal Perahera', '07:05PM', '#FF5733'),
      ('2025-07-31', '2nd Kumbal Perahera', '07:01PM', '#FF5733'),
      ('2025-08-01', '3rd Kumbal Perahera', '07:16PM', '#FF5733'),
      ('2025-08-02', '4th Kumbal Perahera', '06:54PM', '#FF5733'),
      ('2025-08-03', '5th Kumbal Perahera', '06:43PM', '#FF5733'),
      ('2025-08-04', '1st Randoli Perahera', '06:47PM', '#33FF57'),
      ('2025-08-05', '2nd Randoli Perahera', '07:16PM', '#33FF57'),
      ('2025-08-06', '3rd Randoli Perahera', '07:06PM', '#33FF57'),
      ('2025-08-07', '4th Randoli Perahera', '07:02PM', '#33FF57'),
      ('2025-08-08', '5th Randoli Perahera', '06:51PM', '#3357FF');

    -- Insert procession routes for each day
    -- Day 1 routes
    INSERT INTO procession_routes (day_id, latitude, longitude, sequence) VALUES
      (1, 7.2949166, 80.6393802, 1),
      (1, 7.2950762, 80.6375778, 2),
      (1, 7.2952146, 80.6365478, 3),
      (1, 7.2952678, 80.6358075, 4),
      (1, 7.2944909, 80.6358719, 5),
      (1, 7.2943207, 80.6370091, 6),
      (1, 7.2941504, 80.6383073, 7),
      (1, 7.2939961, 80.6393641, 8),
      (1, 7.2949219, 80.6393802, 9);

    -- Day 2 routes
    INSERT INTO procession_routes (day_id, latitude, longitude, sequence) VALUES
      (2, 7.2949432, 80.6393212, 1),
      (2, 7.2950656, 80.6380284, 2),
      (2, 7.2962841, 80.6376904, 3),
      (2, 7.2984284, 80.6370306, 4),
      (2, 7.2983327, 80.6358397, 5),
      (2, 7.2980666, 80.6356144, 6),
      (2, 7.2958105, 80.6357753, 7),
      (2, 7.2953104, 80.6358075, 8),
      (2, 7.2944271, 80.6359148, 9),
      (2, 7.2939482, 80.639348, 10),
      (2, 7.2949379, 80.6393158, 11);

    -- Day 3 routes
    INSERT INTO procession_routes (day_id, latitude, longitude, sequence) VALUES
      (3, 7.293033, 80.6385863, 1),
      (3, 7.2930755, 80.6352067, 2),
      (3, 7.293033, 80.6347346, 3),
      (3, 7.2927669, 80.6342089, 4),
      (3, 7.2915218, 80.6334901, 5),
      (3, 7.290149, 80.6328678, 6),
      (3, 7.2895211, 80.632782, 7),
      (3, 7.2901383, 80.6338763, 8),
      (3, 7.2903086, 80.6343269, 9),
      (3, 7.2911068, 80.6343913, 10),
      (3, 7.2916282, 80.6347883, 11),
      (3, 7.2916708, 80.6352603, 12),
      (3, 7.2913196, 80.6360972, 13),
      (3, 7.2912877, 80.6367624, 14),
      (3, 7.2913196, 80.6371915, 15),
      (3, 7.2913302, 80.6374598, 16),
      (3, 7.292139, 80.6376207, 17),
      (3, 7.2929904, 80.6377602, 18),
      (3, 7.2930223, 80.6385863, 19);

    -- Day 4 routes
    INSERT INTO procession_routes (day_id, latitude, longitude, sequence) VALUES
      (4, 7.2939828, 80.6393775, 1),
      (4, 7.2943047, 80.6369984, 2),
      (4, 7.2946931, 80.6344128, 3),
      (4, 7.2934054, 80.6341982, 4),
      (4, 7.2932352, 80.6347346, 5),
      (4, 7.2931394, 80.6351745, 6),
      (4, 7.2930862, 80.637213, 7),
      (4, 7.2930968, 80.6386399, 8),
      (4, 7.2935012, 80.6385005, 9),
      (4, 7.2935225, 80.6388867, 10),
      (4, 7.2935225, 80.6393373, 11),
      (4, 7.2939695, 80.6394017, 12);

    -- Day 5 routes
    INSERT INTO procession_routes (day_id, latitude, longitude, sequence) VALUES
      (5, 7.2949485, 80.639348, 1),
      (5, 7.2950709, 80.6379855, 2),
      (5, 7.2952093, 80.6368375, 3),
      (5, 7.2962256, 80.6367034, 4),
      (5, 7.2970982, 80.6365317, 5),
      (5, 7.297178, 80.6374598, 6),
      (5, 7.2962575, 80.6377226, 7),
      (5, 7.2950975, 80.6380445, 8),
      (5, 7.2949448, 80.639348, 9);

    -- Day 6 routes
    INSERT INTO procession_routes (day_id, latitude, longitude, sequence) VALUES
      (6, 7.2949272, 80.6393507, 1),
      (6, 7.2950496, 80.6380337, 2),
      (6, 7.2941078, 80.6383181, 3),
      (6, 7.2942914, 80.6369984, 4),
      (6, 7.2951933, 80.6368509, 5),
      (6, 7.2950549, 80.6380069, 6),
      (6, 7.2949326, 80.6393534, 7);

    -- Day 7 routes
    INSERT INTO procession_routes (day_id, latitude, longitude, sequence) VALUES
      (7, 7.2939375, 80.6393749, 1),
      (7, 7.2935651, 80.6393963, 2),
      (7, 7.2935278, 80.6384897, 3),
      (7, 7.2930542, 80.6386453, 4),
      (7, 7.2930383, 80.6371862, 5),
      (7, 7.2942814, 80.6370031, 6),
      (7, 7.2941025, 80.6383449, 7),
      (7, 7.2939402, 80.6393775, 8);

    -- Day 8 routes
    INSERT INTO procession_routes (day_id, latitude, longitude, sequence) VALUES
      (8, 7.2939668, 80.6393775, 1),
      (8, 7.2935491, 80.6393856, 2),
      (8, 7.2934959, 80.6392407, 3),
      (8, 7.2935305, 80.638479, 4),
      (8, 7.2941158, 80.6383315, 5),
      (8, 7.2939641, 80.6393829, 6);

    -- Day 9 routes
    INSERT INTO procession_routes (day_id, latitude, longitude, sequence) VALUES
      (9, 7.2939768, 80.6393849, 1),
      (9, 7.2941424, 80.6382825, 2),
      (9, 7.2943133, 80.636985, 3),
      (9, 7.2944637, 80.6358806, 4),
      (9, 7.2953044, 80.6358303, 5),
      (9, 7.2970477, 80.6357076, 6),
      (9, 7.2971168, 80.6365505, 7),
      (9, 7.2971567, 80.6374517, 8),
      (9, 7.2950569, 80.6380492, 9),
      (9, 7.294906, 80.6393561, 10),
      (9, 7.2939748, 80.6393856, 11);

    -- Day 10 routes
    INSERT INTO procession_routes (day_id, latitude, longitude, sequence) VALUES
      (10, 7.2949326, 80.6393635, 1),
      (10, 7.2950616, 80.6380244, 2),
      (10, 7.295194, 80.6368314, 3),
      (10, 7.2953017, 80.6358451, 4),
      (10, 7.2944783, 80.6358954, 5),
      (10, 7.2930848, 80.6360006, 6),
      (10, 7.2930622, 80.6372083, 7),
      (10, 7.293025, 80.6386198, 8),
      (10, 7.2935185, 80.6385038, 9),
      (10, 7.2941191, 80.638304, 10),
      (10, 7.2939748, 80.6393675, 11),
      (10, 7.2949312, 80.6393655, 12);
  `
};

// Define stored procedures
const storedProcedures = {
  // Register Admin Stored Procedure
  spRegisterAdmin: `
    DROP PROCEDURE IF EXISTS \`sp_register_admin\`;
    
    CREATE PROCEDURE \`sp_register_admin\`(
      IN \`p_caller_user_id\` INT,
      IN \`p_firebase_uid\` VARCHAR(128),
      IN \`p_username\` VARCHAR(50),
      IN \`p_email\` VARCHAR(100),
      IN \`p_mobile_number\` VARCHAR(15)
    )
    BEGIN
      DECLARE caller_role ENUM('super_admin','admin','seller','customer');
    
      -- 1) Fetch the caller's role
      SELECT \`role\`
        INTO caller_role
        FROM \`users\`
       WHERE \`user_id\` = p_caller_user_id;
    
      -- 2) If the caller is not a super_admin, throw an error
      IF caller_role <> 'super_admin' THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Only a Super Admin can create an Admin.';
      END IF;
    
      -- 3) Insert the new user with role = 'admin', and track who created them
      INSERT INTO \`users\` (
        \`firebase_uid\`,
        \`username\`,
        \`email\`,
        \`role\`,
        \`mobile_number\`,
        \`created_at\`,
        \`created_by\`
      )
      VALUES (
        p_firebase_uid,
        p_username,
        p_email,
        'admin',
        p_mobile_number,
        NOW(),
        p_caller_user_id
      );
      SET @new_user_id = LAST_INSERT_ID();
    
      -- 4) Insert into the admins table (just the user_id)
      INSERT INTO \`admins\` (\`user_id\`)
      VALUES (@new_user_id);
    END
  `,

  // Register Seller Stored Procedure
  spRegisterSeller: `
    DROP PROCEDURE IF EXISTS \`sp_register_seller\`;
    
    CREATE PROCEDURE \`sp_register_seller\`(
      IN \`p_caller_user_id\` INT,
      IN \`p_firebase_uid\` VARCHAR(128),
      IN \`p_username\` VARCHAR(50),
      IN \`p_email\` VARCHAR(100),
      IN \`p_mobile_number\` VARCHAR(15),
      IN \`p_first_name\` VARCHAR(50),
      IN \`p_last_name\` VARCHAR(50),
      IN \`p_nic\` VARCHAR(20),
      IN \`p_bank_account_number\` VARCHAR(30),
      IN \`p_bank_name\` VARCHAR(50),
      IN \`p_branch_name\` VARCHAR(50),
      IN \`p_profile_picture\` VARCHAR(255)
    )
    BEGIN
      DECLARE caller_role ENUM('super_admin','admin','seller','customer');
    
      -- 1) Fetch the caller's role
      SELECT \`role\`
        INTO caller_role
        FROM \`users\`
       WHERE \`user_id\` = p_caller_user_id;
    
      -- 2) If the caller is neither admin nor super_admin, throw an error
      IF caller_role NOT IN ('admin','super_admin') THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Only an Admin or Super Admin can create a Seller.';
      END IF;
    
      -- 3) Insert the new user with role = 'seller', track who created them
      INSERT INTO \`users\` (
        \`firebase_uid\`,
        \`username\`,
        \`email\`,
        \`role\`,
        \`mobile_number\`,
        \`created_at\`,
        \`created_by\`
      )
      VALUES (
        p_firebase_uid,
        p_username,
        p_email,
        'seller',
        p_mobile_number,
        NOW(),
        p_caller_user_id
      );
      SET @new_user_id = LAST_INSERT_ID();
    
      -- 4) Insert into the sellers table with profile & bank info
      INSERT INTO \`sellers\` (
        \`user_id\`,
        \`first_name\`,
        \`last_name\`,
        \`nic\`,
        \`bank_account_number\`,
        \`bank_name\`,
        \`branch_name\`,
        \`profile_picture\`
      )
      VALUES (
        @new_user_id,
        p_first_name,
        p_last_name,
        p_nic,
        p_bank_account_number,
        p_bank_name,
        p_branch_name,
        p_profile_picture
      );
    END
  `,

  // Register Customer Stored Procedure
  spRegisterCustomer: `
    DROP PROCEDURE IF EXISTS \`sp_register_customer\`;
    
    CREATE PROCEDURE \`sp_register_customer\`(
      IN \`p_caller_user_id\` INT,
      IN \`p_firebase_uid\` VARCHAR(128),
      IN \`p_username\` VARCHAR(50),
      IN \`p_email\` VARCHAR(100),
      IN \`p_mobile_number\` VARCHAR(15),
      IN \`p_first_name\` VARCHAR(50),
      IN \`p_last_name\` VARCHAR(50)
    )
    BEGIN
      DECLARE caller_role ENUM('super_admin','admin','seller','customer');
    
      -- 1) Fetch the caller's role
      SELECT \`role\`
        INTO caller_role
        FROM \`users\`
       WHERE \`user_id\` = p_caller_user_id;
    
      -- 2) If the caller is neither admin nor super_admin, throw an error
      IF caller_role NOT IN ('admin','super_admin') THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Only an Admin or Super Admin can create a Customer.';
      END IF;
    
      -- 3) Insert the new user with role = 'customer', track who created them
      INSERT INTO \`users\` (
        \`firebase_uid\`,
        \`username\`,
        \`email\`,
        \`role\`,
        \`mobile_number\`,
        \`created_at\`,
        \`created_by\`
      )
      VALUES (
        p_firebase_uid,
        p_username,
        p_email,
        'customer',
        p_mobile_number,
        NOW(),
        p_caller_user_id
      );
      SET @new_user_id = LAST_INSERT_ID();
    
      -- 4) Insert into the customers table with first & last name
      INSERT INTO \`customers\` (
        \`user_id\`,
        \`first_name\`,
        \`last_name\`
      )
      VALUES (
        @new_user_id,
        p_first_name,
        p_last_name
      );
    END
  `,
};

// Database initialization function
const initializeDatabase = async () => {
  try {
    console.log("Creating database and tables...");

    // Step 1: Create database using pool without database specified
    await query(createTableQueries.createDatabase);
    console.log("Database created/selected successfully");

    // Step 2: Close initial pool and create new pool with database specified
    await new Promise((resolve) => {
      pool.end(() => {
        pool = createConnectionPool(true); // Now include database name
        resolve();
      });
    });
    console.log("Reconnected to database with proper configuration"); 
    
    // Step 3: Create all tables in proper order
    const tableOrder = [
      "usersTable",
      "customersTable",
      "sellersTable",
      "adminsTable",
      "shopsTable",
      "processionDaysTable",
      "processionRoutesTable",
      "seatTypesTable",
      "seatTypeAvailabilityTable",
      "cartItemsTable",
      "bookingsTable",
      "paymentsTable",
      "paymentNotificationsTable",
      "activityLogsTable",
      "checkoutCustomersTable",
      "customerTicketsTable",
    ];
    
    for (const tableName of tableOrder) {
      await query(createTableQueries[tableName]);
      console.log(`${tableName} created successfully`);
    } 
    
    // Step 3.5: Update existing tables for new features
    try {
      await query(createTableQueries.updateCustomerTicketsTable);
      console.log("Customer tickets table updated for multi-shop support");
    } catch (error) {
      // Ignore errors if columns already exist
      console.log(
        "Customer tickets table update skipped (columns may already exist)"
      );
    }

    // Step 3.6: Apply ticket number system migration
    try {
      await query(createTableQueries.ticketNumberSystemMigration);
      console.log("Ticket number system migration applied successfully");
    } catch (error) {
      // Ignore errors if ticket_no column already exists
      console.log(
        "Ticket number system migration skipped (ticket_no column may already exist)"
      );
    }

    // Step 3.7: Apply new fields migration (qrcode_url, color, and expires_at fields)
    try {
      await query(createTableQueries.newFieldsMigration);
      console.log(
        "New fields migration applied successfully (qrcode_url, color, and expires_at fields)"
      );
    } catch (error) {
      // Ignore errors if fields already exist
      console.log(
        "New fields migration skipped (qrcode_url, color, and expires_at fields may already exist)"
      );
    }

    // Step 3.8: Apply customer tickets foreign key migration
    try {
      await query(createTableQueries.customerTicketsForeignKeyMigration);
      console.log(
        "Customer tickets foreign key migration applied successfully (account_owner_id -> users.user_id)"
      );
    } catch (error) {
      // Ignore errors if foreign key already exists
      console.log(
        "Customer tickets foreign key migration skipped (foreign key may already exist)"
      );
    }

    // Step 3.9: Apply customer tickets additional fields migration
    try {
      await query(createTableQueries.customerTicketsAdditionalFieldsMigration);
      console.log(
        "Customer tickets additional fields migration applied successfully (shop_id, booking_id, day_id foreign keys)"
      );
    } catch (error) {
      // Ignore errors if fields/foreign keys already exist
      console.log(
        "Customer tickets additional fields migration skipped (fields/foreign keys may already exist)"
      );
    }

    // Step 3.10: Apply 'used' field migration
    try {
      await query(createTableQueries.addUsedFieldMigration);
      console.log(
        "Used field migration applied successfully (used field with check constraint)"
      );
    } catch (error) {
      // Ignore errors if field already exists
      console.log(
        "Used field migration skipped (used field may already exist)"
      );
    }

    // Step 4: Create stored procedures
    for (const [procName, procSQL] of Object.entries(storedProcedures)) {
      await query(procSQL);
      console.log(`${procName} created successfully`);
    }

    // Step 5: Add procession days and routes
    try {
      await query(createTableQueries.addProcessionDaysAndRoutes);
      console.log("Procession days and routes added successfully");
    } catch (error) {
      console.log("Procession days and routes may already exist or there was an error:", error.message);
    }

    // Step 6: Create default super_admin user if it doesn't exist
    try {
      const existingUser = await query(
        "SELECT user_id FROM users WHERE username = ?",
        ["superadmin"]
      );

      if (existingUser.length === 0) {
        await query(`
          INSERT INTO users (firebase_uid, username, email, role, mobile_number)
          VALUES ('superadmin-uid-123', 'superadmin', 'superadmin@example.com', 'super_admin', '1234567890')
        `);

        const [superAdmin] = await query(
          "SELECT user_id FROM users WHERE username = ?",
          ["superadmin"]
        );

        await query(`INSERT INTO admins (user_id) VALUES (?)`, [
          superAdmin.user_id,
        ]);

        console.log("Default super_admin account created successfully");
      }
    } catch (err) {
      console.warn(
        "Could not create default super_admin account:",
        err.message
      );
    }

    console.log("Database initialization completed successfully");
    return true;
  } catch (err) {
    console.error("Database initialization failed:", err);
    throw err;
  }
};

// Migration function specifically for checkout flow changes
const migrateCheckoutFlow = async () => {
  try {
    console.log("Starting checkout flow migration...");

    // Step 1: Create checkout_customers table
    await query(createTableQueries.checkoutCustomersTable);
    console.log("checkout_customers table created successfully"); 
    
    // Step 2: Update customer_tickets table structure
    await query(createTableQueries.updateCustomerTicketsTable);
    console.log("customer_tickets table updated successfully");

    // Step 3: Apply ticket number system migration
    await query(createTableQueries.ticketNumberSystemMigration);
    console.log("ticket number system migration applied successfully");

    console.log("Checkout flow migration completed successfully");
    return true;
  } catch (err) {
    console.error("Checkout flow migration failed:", err);
    throw err;
  }
};

// Migration function specifically for ticket number system
const migrateTicketNumberSystem = async () => {
  try {
    console.log("Starting ticket number system migration...");

    // Ensure we're connected to the correct database
    if (!pool.config.connectionConfig.database) {
      console.log("Switching to database-specific connection pool...");
      await new Promise((resolve) => {
        pool.end(() => {
          pool = createConnectionPool(true); // Include database name
          resolve();
        });
      });
      console.log("Reconnected with database configuration");
    }

    // Apply ticket number system migration
    await query(createTableQueries.ticketNumberSystemMigration);
    console.log("ticket_no column and indexes added successfully");

    console.log("Ticket number system migration completed successfully");
    return true;
  } catch (err) {
    console.error("Ticket number system migration failed:", err);
    throw err;
  }
};

// Migration function specifically for removing customer_id column
const removeCustomerIdColumn = async () => {
  try {
    console.log("Starting customer_id column removal migration...");

    // Ensure we're connected to the correct database
    if (!pool.config.connectionConfig.database) {
      console.log("Switching to database-specific connection pool...");
      await new Promise((resolve) => {
        pool.end(() => {
          pool = createConnectionPool(true); // Include database name
          resolve();
        });
      });
      console.log("Reconnected with database configuration");
    }

    // Apply customer_id removal migration
    await query(createTableQueries.removeCustomerIdColumnMigration);
    console.log(
      "customer_id column, constraints and indexes removed successfully"
    );

    console.log("Customer ID column removal migration completed successfully");
    return true;
  } catch (err) {
    console.error("Customer ID column removal migration failed:", err);
    throw err;
  }
};

module.exports = {
  query,
  initializeDatabase,
  migrateCheckoutFlow,
  migrateTicketNumberSystem,
  removeCustomerIdColumn,
  pool,
  bcrypt,
  SALT_ROUNDS,
};

// Run initialization if this file is executed directly
if (require.main === module) {
  (async () => {
    try {
      console.log("Starting database initialization...");
      await initializeDatabase();
      console.log("Database setup completed successfully!");
      process.exit(0);
    } catch (error) {
      console.error("Database setup failed:", error);
      process.exit(1);
    }
  })();
}