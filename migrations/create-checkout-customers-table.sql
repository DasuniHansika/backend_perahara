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

-- Update customer_tickets table structure
-- First, add the new columns
ALTER TABLE customer_tickets 
ADD COLUMN account_owner_id INT AFTER customer_id,
ADD COLUMN checkout_customer_id INT AFTER account_owner_id;

-- Copy existing customer_id to account_owner_id
UPDATE customer_tickets SET account_owner_id = customer_id;

-- Add foreign key constraints
ALTER TABLE customer_tickets 
ADD CONSTRAINT fk_customer_tickets_account_owner 
    FOREIGN KEY (account_owner_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
ADD CONSTRAINT fk_customer_tickets_checkout_customer 
    FOREIGN KEY (checkout_customer_id) REFERENCES checkout_customers(id) ON DELETE CASCADE;

-- Remove the old columns (first_name, last_name, email, phone, country)
ALTER TABLE customer_tickets 
DROP COLUMN first_name,
DROP COLUMN last_name,
DROP COLUMN email,
DROP COLUMN phone,
DROP COLUMN country;

-- Update customer_id to reference checkout_customers table
ALTER TABLE customer_tickets 
MODIFY COLUMN customer_id INT,
ADD CONSTRAINT fk_customer_tickets_customer 
    FOREIGN KEY (customer_id) REFERENCES checkout_customers(id) ON DELETE CASCADE;
