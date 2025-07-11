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

-- Check and add account_owner_id column if it doesn't exist
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE table_name = 'customer_tickets' 
     AND table_schema = DATABASE() 
     AND column_name = 'account_owner_id') = 0,
    'ALTER TABLE customer_tickets ADD COLUMN account_owner_id INT AFTER customer_id',
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
    'ALTER TABLE customer_tickets ADD COLUMN checkout_customer_id INT AFTER account_owner_id',
    'SELECT "Column checkout_customer_id already exists"'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update account_owner_id with existing customer_id values where null
UPDATE customer_tickets SET account_owner_id = customer_id WHERE account_owner_id IS NULL;
