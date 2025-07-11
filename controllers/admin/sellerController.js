// controllers/sellerController.js
const { query } = require("../../config/database-schema");
const fs = require("fs");
const path = require("path");
const { sendVerificationEmail } = require('../../config/firebaseAuthSync');


exports.getSellerById = async (req, res) => {
  try {
    const { id } = req.params;

    // Query seller data
    const sellerData = await query(
      `
      SELECT s.seller_id, u.username, u.email, u.mobile_number,
             s.first_name, s.last_name, s.profile_picture,
             s.nic, s.bank_account_number, s.bank_name, s.branch_name,
             u.created_at
      FROM sellers s
      JOIN users u ON s.user_id = u.user_id
      WHERE s.seller_id = ?
      `,
      [id]
    );

    if (sellerData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Get seller's shops
    const shops = await query(
      `
      SELECT shop_id, name, street, latitude, longitude, 
             image1, image2, image3, image4, description
      FROM shops
      WHERE seller_id = ?
      `,
      [id]
    ); // Process sensitive information
    const seller = sellerData[0];

    return res.status(200).json({
      success: true,
      seller,
      shops,
    });
  } catch (error) {
    console.error("Error fetching seller profile:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seller profile",
      error: error.message,
    });
  }
};


exports.getAllSellers = async (req, res) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT s.seller_id, u.username, u.email, u.mobile_number,
             s.first_name, s.last_name, s.profile_picture,
             u.created_at,
             (SELECT COUNT(*) FROM shops WHERE seller_id = s.seller_id) as shop_count
      FROM sellers s
      JOIN users u ON s.user_id = u.user_id
    `;

    const params = [];

    if (search) {
      sql += `
        WHERE u.username LIKE ? 
        OR u.email LIKE ? 
        OR s.first_name LIKE ? 
        OR s.last_name LIKE ?
        OR u.mobile_number LIKE ?
      `;
      const searchPattern = `%${search}%`;
      params.push(
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern
      );
    }

    sql += " ORDER BY u.created_at DESC";

    const sellers = await query(sql, params);

    return res.status(200).json({
      success: true,
      count: sellers.length,
      sellers,
    });
  } catch (error) {
    console.error("Error fetching sellers:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching sellers",
      error: error.message,
    });
  }
};


// exports.createSeller = async (req, res) => {
//   try {
//     const {
//       username,
//       email,
//       mobileNumber,
//       firstName,
//       lastName,
//       nic,
//       bankAccountNumber,
//       bankName,
//       branchName,
//       firebase_uid, // Add firebase_uid
//       role = 'seller'
//     } = req.body;

//     // Validate required fields
//     if (!username || !email || !firstName || !lastName || !nic || 
//         !bankAccountNumber || !bankName || !branchName || !firebase_uid) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields",
//       });
//     }

//     // Check if username already exists
//     const existingUser = await query(
//       "SELECT user_id FROM users WHERE username = ? OR firebase_uid = ?",
//       [username, firebase_uid]
//     );

//     if (existingUser.length > 0) {
//       return res.status(409).json({
//         success: false,
//         message: "Username or Firebase UID already exists",
//       });
//     }

//     // Begin transaction
//     await query("START TRANSACTION");

//     try {
//       // Insert into users table with role 'seller'
//       const userResult = await query(
//         "INSERT INTO users (firebase_uid, username, email, role, mobile_number, created_by) VALUES (?, ?, ?, ?, ?, ?)",
//         [
//           firebase_uid,
//           username, 
//           email, 
//           role,
//           mobileNumber || null, 
//           req.user.id
//         ]
//       );

//       const userId = userResult.insertId;

//       // Insert into sellers table
//       await query(
//         "INSERT INTO sellers (user_id, first_name, last_name, nic, bank_account_number, bank_name, branch_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
//         [
//           userId,
//           firstName,
//           lastName,
//           nic,
//           bankAccountNumber,
//           bankName,
//           branchName,
//         ]
//       );

//       // Log activity
//       await query(
//         "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seller_created', ?, ?, 'seller')",
//         [
//           req.user.id,
//           req.user.role,
//           `Created seller account for ${username}`,
//           userId,
//         ]
//       );

//       // Commit transaction
//       await query("COMMIT");

//       // Get the new seller data
//       const [newSeller] = await query(
//         `SELECT s.seller_id, u.user_id, u.username, u.email, u.role, u.mobile_number,
//                 s.first_name, s.last_name
//          FROM users u
//          JOIN sellers s ON u.user_id = s.user_id
//          WHERE u.user_id = ?`,
//         [userId]
//       );

//       return res.status(201).json({
//         success: true,
//         message: "Seller created successfully",
//         seller: newSeller,
//       });
//     } catch (error) {
//       // Rollback transaction on error
//       await query("ROLLBACK");
//       throw error;
//     }
//   } catch (error) {
//     console.error("Error creating seller:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error creating seller",
//       error: error.message,
//     });
//   }
// };

exports.createSeller = async (req, res) => {
  try {
    const {
      username,
      email,
      mobileNumber,
      firstName,
      lastName,
      nic,
      bankAccountNumber,
      bankName,
      branchName,
      firebase_uid,
      role = 'seller'
    } = req.body;

    // Validate required fields
    if (!username || !email || !firstName || !lastName || !nic || 
        !bankAccountNumber || !bankName || !branchName || !firebase_uid) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Check if username already exists
    const existingUser = await query(
      "SELECT user_id FROM users WHERE username = ? OR firebase_uid = ?",
      [username, firebase_uid]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username or Firebase UID already exists",
      });
    }

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Insert into users table with role 'seller'
      const userResult = await query(
        "INSERT INTO users (firebase_uid, username, email, role, mobile_number, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        [
          firebase_uid,
          username, 
          email, 
          role,
          mobileNumber || null, 
          req.user.id
        ]
      );

      const userId = userResult.insertId;

      // Insert into sellers table
      await query(
        "INSERT INTO sellers (user_id, first_name, last_name, nic, bank_account_number, bank_name, branch_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          userId,
          firstName,
          lastName,
          nic,
          bankAccountNumber,
          bankName,
          branchName,
        ]
      );

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seller_created', ?, ?, 'seller')",
        [
          req.user.id,
          req.user.role,
          `Created seller account for ${username}`,
          userId,
        ]
      );

      // Commit transaction
      await query("COMMIT");

      // Get the new seller data
      const [newSeller] = await query(
        `SELECT s.seller_id, u.user_id, u.username, u.email, u.role, u.mobile_number,
                s.first_name, s.last_name
         FROM users u
         JOIN sellers s ON u.user_id = s.user_id
         WHERE u.user_id = ?`,
        [userId]
      );

      // Get the actual Firebase user from Firebase Auth
      try {
        const auth = getAuth();
        const firebaseUser = await auth.getUser(firebase_uid);
        
        // Send verification email to the seller
        await sendVerificationEmail({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: `${firstName} ${lastName}`,
          emailVerified: firebaseUser.emailVerified,
          phoneNumber: mobileNumber || null
        });
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(201).json({
        success: true,
        message: "Seller created successfully",
        seller: newSeller,
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error creating seller:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating seller",
      error: error.message,
    });
  }
};
exports.updateSeller = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      username,
      email,
      mobileNumber,
      firstName,
      lastName,
      nic,
      bankAccountNumber,
      bankName,
      branchName,
    } = req.body;

    // Get seller data to check if it exists
    const sellerData = await query(
      "SELECT s.user_id FROM sellers s WHERE s.seller_id = ?",
      [id]
    );

    if (sellerData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    const userId = sellerData[0].user_id;

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Update users table
      if (username || email || mobileNumber !== undefined) {
        const userUpdates = {};

        if (username) {
          // Check if username already exists for another user
          const existingUser = await query(
            "SELECT user_id FROM users WHERE username = ? AND user_id != ?",
            [username, userId]
          );

          if (existingUser.length > 0) {
            await query("ROLLBACK");
            return res.status(409).json({
              success: false,
              message: "Username already taken",
            });
          }

          userUpdates.username = username;
        }

        if (email) userUpdates.email = email;
        if (mobileNumber !== undefined)
          userUpdates.mobile_number = mobileNumber;

        if (Object.keys(userUpdates).length > 0) {
          const setClause = Object.keys(userUpdates)
            .map((key) => `${key} = ?`)
            .join(", ");

          const values = Object.values(userUpdates);
          values.push(userId);

          await query(
            `UPDATE users SET ${setClause} WHERE user_id = ?`,
            values
          );
        }
      }

      // Update sellers table
      if (
        firstName ||
        lastName ||
        nic ||
        bankAccountNumber ||
        bankName ||
        branchName
      ) {
        const sellerUpdates = {};

        if (firstName) sellerUpdates.first_name = firstName;
        if (lastName) sellerUpdates.last_name = lastName;
        if (nic) sellerUpdates.nic = nic;
        if (bankAccountNumber)
          sellerUpdates.bank_account_number = bankAccountNumber;
        if (bankName) sellerUpdates.bank_name = bankName;
        if (branchName) sellerUpdates.branch_name = branchName;

        if (Object.keys(sellerUpdates).length > 0) {
          const setClause = Object.keys(sellerUpdates)
            .map((key) => `${key} = ?`)
            .join(", ");

          const values = Object.values(sellerUpdates);
          values.push(id);

          await query(
            `UPDATE sellers SET ${setClause} WHERE seller_id = ?`,
            values
          );
        }
      }

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seller_updated', ?, ?, 'seller')",
        [
          req.user.id,
          req.user.role,
          `Updated seller profile for seller ID ${id}`,
          id,
        ]
      );

      // Commit transaction
      await query("COMMIT");

      // Get updated seller data
      const [updatedSeller] = await query(
        `
        SELECT s.seller_id, u.username, u.email, u.mobile_number,
               s.first_name, s.last_name, s.profile_picture,
               s.nic, s.bank_account_number, s.bank_name, s.branch_name
        FROM sellers s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.seller_id = ?
        `,
        [id]
      );

      return res.status(200).json({
        success: true,
        message: "Seller updated successfully",
        seller: updatedSeller,
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error updating seller:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating seller",
      error: error.message,
    });
  }
};


function maskSensitiveInfo(text) {
  if (!text) return null;
  if (text.length <= 4) {
    return "*".repeat(text.length);
  }
  return "*".repeat(text.length - 4) + text.slice(-4);
}


function isSameSellerAsLoggedIn(req, sellerId) {
  if (!req.user || req.user.role !== "seller") return false;

  // This is a simplification - in reality, you'd need to fetch the seller_id for the current user
  return req.user.sellerId === sellerId;
}


exports.deleteSeller = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if seller exists
    const sellerData = await query(
      "SELECT s.user_id FROM sellers s WHERE s.seller_id = ?",
      [id]
    );

    if (sellerData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Check if seller has any shops
    const shops = await query(
      "SELECT COUNT(*) as count FROM shops WHERE seller_id = ?",
      [id]
    );

    if (shops[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete seller with existing shops",
      });
    }

    const userId = sellerData[0].user_id;

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Delete from sellers table first
      await query("DELETE FROM sellers WHERE seller_id = ?", [id]);

      // Delete from users table
      await query("DELETE FROM users WHERE user_id = ?", [userId]);

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'seller_deleted', ?, ?, 'seller')",
        [req.user.id, req.user.role, `Deleted seller with ID ${id}`, id]
      );

      // Commit transaction
      await query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Seller deleted successfully",
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error deleting seller:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting seller",
      error: error.message,
    });
  }
};


exports.loginSeller = async (req, res) => {
  try {
    return res.status(501).json({
      success: false,
      message: "Login is handled through Firebase authentication",
    });
  } catch (error) {
    console.error("Error in loginSeller:", error);
    return res.status(500).json({
      success: false,
      message: "Error in login process",
      error: error.message,
    });
  }
};

exports.getSellerShops = async (req, res) => {
  try {
    const { id } = req.params;

    // Get shops with seat types and availability
    const shops = await query(`
      SELECT 
        sh.shop_id, sh.name, sh.street, sh.latitude, sh.longitude,
        sh.image1, sh.image2, sh.image3, sh.image4, sh.description,
        st.seat_type_id, st.name as seat_type_name, st.image_url as seat_image,
        st.description as seat_description,
        sta.availability_id, sta.day_id, sta.price, sta.quantity, sta.available,
        pd.date, pd.event_name
      FROM shops sh
      LEFT JOIN seat_types st ON sh.shop_id = st.shop_id
      LEFT JOIN seat_type_availability sta ON st.seat_type_id = sta.seat_type_id
      LEFT JOIN procession_days pd ON sta.day_id = pd.day_id
      WHERE sh.seller_id = ?
      ORDER BY sh.shop_id, st.seat_type_id, pd.date
    `, [id]);

    // Format the data into a nested structure
    const formattedShops = shops.reduce((acc, row) => {
      let shop = acc.find(s => s.shop_id === row.shop_id);
      if (!shop) {
        shop = {
          shop_id: row.shop_id,
          name: row.name,
          street: row.street,
          latitude: row.latitude,
          longitude: row.longitude,
          images: [row.image1, row.image2, row.image3, row.image4].filter(Boolean),
          description: row.description,
          seat_types: []
        };
        acc.push(shop);
      }

      if (row.seat_type_id) {
        let seatType = shop.seat_types.find(st => st.seat_type_id === row.seat_type_id);
        if (!seatType) {
          seatType = {
            seat_type_id: row.seat_type_id,
            name: row.seat_type_name,
            image_url: row.seat_image,
            description: row.seat_description,
            availability: []
          };
          shop.seat_types.push(seatType);
        }

        if (row.availability_id) {
          seatType.availability.push({
            availability_id: row.availability_id,
            day_id: row.day_id,
            date: row.date,
            event_name: row.event_name,
            price: row.price,
            quantity: row.quantity,
            available: row.available
          });
        }
      }

      return acc;
    }, []);

    return res.status(200).json({
      success: true,
      shops: formattedShops
    });
  } catch (error) {
    console.error("Error fetching seller shops:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seller shops",
      error: error.message
    });
  }
};





exports.getSellerBookings = async (req, res) => {
  try {
    const { id } = req.params;
    
    const bookings = await query(`
      SELECT 
        b.booking_id, b.quantity, b.total_price, b.status, b.created_at,
        c.first_name, c.last_name, c.profile_picture as customer_image,
        sh.name as shop_name, st.name as seat_type_name,
        pd.date, pd.event_name
      FROM bookings b
      JOIN customers c ON b.customer_id = c.customer_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN shops sh ON b.shop_id = sh.shop_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      WHERE sh.seller_id = ?
      ORDER BY b.created_at DESC
    `, [id]);

    return res.status(200).json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error("Error fetching seller bookings:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seller bookings",
      error: error.message
    });
  }
};

exports.getSellerPayments = async (req, res) => {
  try {
    const { id } = req.params;
    
    const payments = await query(`
      SELECT 
        p.payment_id, p.amount, p.payment_method, p.status, p.created_at,
        p.payhere_order_id, p.payhere_payment_id,
        b.booking_id, b.quantity, b.total_price,
        c.first_name, c.last_name,
        sh.name as shop_name, st.name as seat_type_name,
        pd.date, pd.event_name
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN customers c ON b.customer_id = c.customer_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN shops sh ON b.shop_id = sh.shop_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      WHERE sh.seller_id = ?
      ORDER BY p.created_at DESC
    `, [id]);

    return res.status(200).json({
      success: true,
      payments
    });
  } catch (error) {
    console.error("Error fetching seller payments:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching seller payments",
      error: error.message
    });
  }
};

exports.createSellerWithShops = async (req, res) => {
  try {
    const {
      // Seller data
      first_name,
      last_name,
      email,
      mobile_number,
      nic,
      bank_name,
      bank_account_number,
      branch_name,
      profile_picture,
      
      // Shops data
      shops
    } = req.body;

    // Validate required fields
    if (!first_name || !last_name || !email || !nic || 
        !bank_name || !bank_account_number || !branch_name) {
      return res.status(400).json({
        success: false,
        message: "Missing required seller fields"
      });
    }

    if (!shops || !Array.isArray(shops) || shops.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one shop is required"
      });
    }

    // Start transaction
    await query('START TRANSACTION');

    try {
      // 1. Create user
      const userResult = await query(
        `INSERT INTO users 
         (username, email, role, mobile_number) 
         VALUES (?, ?, 'seller', ?)`,
        [email, email, mobile_number]
      );
      const userId = userResult.insertId;

      // 2. Create seller
      const sellerResult = await query(
        `INSERT INTO sellers 
         (user_id, first_name, last_name, nic, bank_account_number, bank_name, branch_name, profile_picture) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, 
          first_name, 
          last_name, 
          nic, 
          bank_account_number, 
          bank_name, 
          branch_name,
          profile_picture || null
        ]
      );
      const sellerId = sellerResult.insertId;

      // 3. Create shops, seat types, and availability
      for (const shop of shops) {
        // Validate shop data
        if (!shop.name || !shop.latitude || !shop.longitude) {
          await query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: "Missing required shop fields (name, latitude, longitude)"
          });
        }

        // Create shop
        const shopResult = await query(
          `INSERT INTO shops 
           (seller_id, name, street, latitude, longitude, image1, image2, image3, image4, description) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sellerId,
            shop.name,
            shop.street || null,
            shop.latitude,
            shop.longitude,
            shop.images?.[0] || null,
            shop.images?.[1] || null,
            shop.images?.[2] || null,
            shop.images?.[3] || null,
            shop.description || null
          ]
        );
        const shopId = shopResult.insertId;

        // Create seat types if provided
        if (shop.seat_types && Array.isArray(shop.seat_types)) {
          for (const seatType of shop.seat_types) {
            if (!seatType.name) {
              await query('ROLLBACK');
              return res.status(400).json({
                success: false,
                message: "Seat type name is required"
              });
            }

            const seatTypeResult = await query(
              `INSERT INTO seat_types 
               (shop_id, name, image_url, description) 
               VALUES (?, ?, ?, ?)`,
              [
                shopId,
                seatType.name,
                seatType.image_url || null,
                seatType.description || null
              ]
            );
            const seatTypeId = seatTypeResult.insertId;

            // Create availability if provided
            if (seatType.availability && Array.isArray(seatType.availability)) {
              for (const availability of seatType.availability) {
                if (!availability.day_id || availability.price === undefined || availability.quantity === undefined) {
                  await query('ROLLBACK');
                  return res.status(400).json({
                    success: false,
                    message: "Day ID, price, and quantity are required for availability"
                  });
                }

                await query(
                  `INSERT INTO seat_type_availability 
                   (seat_type_id, day_id, price, quantity, available) 
                   VALUES (?, ?, ?, ?, ?)`,
                  [
                    seatTypeId,
                    availability.day_id,
                    availability.price,
                    availability.quantity,
                    availability.available !== false
                  ]
                );
              }
            }
          }
        }
      }

      // Commit transaction
      await query('COMMIT');

      // Log activity
      await query(
        `INSERT INTO activity_logs 
         (user_id, role, action_type, description, affected_entity_id, entity_type) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          req.user.role,
          'seller_created_with_shops',
          `Created seller ${first_name} ${last_name} with ${shops.length} shops`,
          sellerId,
          'seller'
        ]
      );

      // Get the complete seller data with shops
      const [newSeller] = await query(
        `SELECT s.*, u.email, u.mobile_number 
         FROM sellers s 
         JOIN users u ON s.user_id = u.user_id 
         WHERE s.seller_id = ?`,
        [sellerId]
      );

      return res.status(201).json({
        success: true,
        message: "Seller with shops created successfully",
        seller: newSeller
      });

    } catch (error) {
      // Rollback on error
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error("Error creating seller with shops:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating seller with shops",
      error: error.message
    });
  }
};








