-- Create checkout_customers table for storing customer details from checkout form
CREATE TABLE IF NOT EXISTS checkout_customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    payhere_order_id VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    country VARCHAR(100),
    status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payhere_order_id (payhere_order_id),
    INDEX idx_status (status)
);

-- Update customer_tickets table structure step by step
-- First, add the new columns without constraints
ALTER TABLE customer_tickets 
ADD COLUMN account_owner_id INT AFTER customer_id,
ADD COLUMN checkout_customer_id INT AFTER account_owner_id;

-- Copy existing customer_id to account_owner_id
UPDATE customer_tickets SET account_owner_id = customer_id;

-- Remove the old columns (first_name, last_name, email, phone, country) if they exist
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

-- Now add the foreign key constraints
ALTER TABLE customer_tickets 
ADD CONSTRAINT fk_customer_tickets_checkout_customer 
    FOREIGN KEY (checkout_customer_id) REFERENCES checkout_customers(id) ON DELETE CASCADE;

-- Make customer_id reference checkout_customers table (nullable for backward compatibility)
ALTER TABLE customer_tickets 
ADD CONSTRAINT fk_customer_tickets_customer 
    FOREIGN KEY (customer_id) REFERENCES checkout_customers(id) ON DELETE SET NULL;
