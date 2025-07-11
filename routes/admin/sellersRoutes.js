const express = require('express');
const router = express.Router();
// const { verifyFirebaseToken } = require('../../middleware/auth');
const { verifyFirebaseToken, requireRole } = require("../../middleware/firebaseAuth");
const sellersController = require('../../controllers/admin/sellerController');
const { query } = require('../../config/database-schema');

// Get all sellers
router.get('/', verifyFirebaseToken,requireRole(["admin", "super_admin"]), async (req, res) => {
  try {
    const sellers = await query(`
      SELECT s.*, u.email, u.mobile_number 
      FROM sellers s
      JOIN users u ON s.user_id = u.user_id
    `);
    res.json(sellers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Get single seller
router.get('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const seller = await query(`
      SELECT s.*, u.email, u.mobile_number 
      FROM sellers s
      JOIN users u ON s.user_id = u.user_id
      WHERE s.seller_id = ?
    `, [req.params.id]);
    
    if (seller.length === 0) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    
    res.json(seller[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// sellersRoutes.js
router.post('/', verifyFirebaseToken, async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      mobile_number,
      nic,
      bank_name,
      bank_account_number,
      branch_name,
      username,
      firebase_uid // Add firebase_uid from the request
    } = req.body;

    // Start transaction
    await query('START TRANSACTION');

    // 1. First create the user with role 'seller'
    const userResult = await query(
      `INSERT INTO users 
       (firebase_uid, username, email, role, mobile_number) 
       VALUES (?, ?, ?, 'seller', ?)`,
      [firebase_uid, username || email, email, mobile_number]
    );
    const userId = userResult.insertId;

    // 2. Then create the seller
    await query(
      `INSERT INTO sellers 
       (user_id, first_name, last_name, nic, bank_account_number, bank_name, branch_name) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, first_name, last_name, nic, bank_account_number, bank_name, branch_name]
    );

    // Commit transaction
    await query('COMMIT');

    res.status(201).json({ message: 'Seller created successfully' });
  } catch (error) {
    // Rollback on error
    await query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});
// Update seller
router.put('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name,
      last_name,
      email,
      mobile_number,
      nic,
      bank_name,
      bank_account_number,
      branch_name
    } = req.body;

    // Start transaction
    await query('START TRANSACTION');

    // 1. Get the user_id for this seller
    const [seller] = await query('SELECT user_id FROM sellers WHERE seller_id = ?', [id]);
    
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    // 2. Update the user
    await query(
      `UPDATE users 
       SET email = ?, mobile_number = ? 
       WHERE user_id = ?`,
      [email, mobile_number, seller.user_id]
    );

    // 3. Update the seller
    await query(
      `UPDATE sellers 
       SET first_name = ?, last_name = ?, nic = ?, 
           bank_account_number = ?, bank_name = ?, branch_name = ? 
       WHERE seller_id = ?`,
      [first_name, last_name, nic, bank_account_number, bank_name, branch_name, id]
    );

    // Commit transaction
    await query('COMMIT');

    res.json({ message: 'Seller updated successfully' });
  } catch (error) {
    // Rollback on error
    await query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// Delete seller
router.delete('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Start transaction
    await query('START TRANSACTION');

    // 1. Get the user_id for this seller
    const [seller] = await query('SELECT user_id FROM sellers WHERE seller_id = ?', [id]);
    
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    // 2. Delete the seller
    await query('DELETE FROM sellers WHERE seller_id = ?', [id]);

    // 3. Delete the user
    await query('DELETE FROM users WHERE user_id = ?', [seller.user_id]);

    // Commit transaction
    await query('COMMIT');

    res.json({ message: 'Seller deleted successfully' });
  } catch (error) {
    // Rollback on error
    await query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});
// sellersRoutes.js
router.get('/:id/shops', verifyFirebaseToken, sellersController.getSellerShops);

// sellersRoutes.js
router.get('/:id/bookings', verifyFirebaseToken, sellersController.getSellerBookings);
router.get('/:id/payments', verifyFirebaseToken, sellersController.getSellerPayments);
router.post('/create-with-shops', verifyFirebaseToken, sellersController.createSellerWithShops);

module.exports = router; 

