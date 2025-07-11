// // controllers/bookingController.js
// const { query } = require("../../config/database-schema");


// const generateImageUrl = (req, filePath) => {
//   if (!filePath) return null;

//   // If filePath is already a full URL, return it as-is
//   if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
//     return filePath;
//   }

//   // Check if the filePath contains a full URL within it (for cases like "uploads/shops/https://...")
//   const urlMatch = filePath.match(/(https?:\/\/[^\s]+)/);
//   if (urlMatch) {
//     return urlMatch[1];
//   }

//   // Otherwise, generate local server URL
//   return `${req.protocol}://${req.get("host")}/${filePath.replace(/\\/g, "/")}`;
// };


// exports.createBooking = async (req, res) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     const { cartItemIds } = req.body;

//     if (
//       !cartItemIds ||
//       !Array.isArray(cartItemIds) ||
//       cartItemIds.length === 0
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Cart item IDs are required",
//       });
//     }

//     // Get customer ID for the user
//     const customerResults = await query(
//       "SELECT customer_id FROM customers WHERE user_id = ?",
//       [req.user.id]
//     );

//     if (customerResults.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Customer profile not found",
//       });
//     }

//     const customerId = customerResults[0].customer_id;

//     // Get cart items to book
//     const cartItemsQuery = `
//       SELECT ci.cart_item_id, ci.shop_id, ci.seat_type_id, ci.day_id,
//              ci.quantity, ci.price_per_seat, ci.total_price, ci.expires_at
//       FROM cart_items ci
//       WHERE ci.cart_item_id IN (?) AND ci.customer_id = ?
//     `;

//     const cartItems = await query(cartItemsQuery, [cartItemIds, customerId]);

//     if (cartItems.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "No valid cart items found",
//       });
//     }

//     // Check if any cart items have expired
//     const now = new Date();
//     const expiredItems = cartItems.filter(
//       (item) => item.expires_at && new Date(item.expires_at) < now
//     );

//     if (expiredItems.length > 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Some cart items have expired",
//         expiredItems: expiredItems.map((item) => item.cart_item_id),
//       });
//     }

//     // Verify availability for each cart item
//     for (const item of cartItems) {
//       // Check seat type availability
//       const availabilityResults = await query(
//         `
//         SELECT sta.quantity, sta.available
//         FROM seat_type_availability sta
//         WHERE sta.seat_type_id = ? AND sta.day_id = ?
//         `,
//         [item.seat_type_id, item.day_id]
//       );

//       if (
//         availabilityResults.length === 0 ||
//         !availabilityResults[0].available
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: `Seat type for cart item ${item.cart_item_id} is no longer available`,
//           unavailableItemId: item.cart_item_id,
//         });
//       }

//       const availability = availabilityResults[0];

//       // Check existing bookings
//       const bookedQuantity = await query(
//         `
//         SELECT COALESCE(SUM(quantity), 0) as booked_quantity
//         FROM bookings
//         WHERE seat_type_id = ? AND day_id = ? AND status IN ('pending', 'confirmed')
//         `,
//         [item.seat_type_id, item.day_id]
//       );

//       const totalBooked = parseInt(bookedQuantity[0].booked_quantity);
//       const availableQuantity = availability.quantity - totalBooked;

//       if (item.quantity > availableQuantity) {
//         return res.status(400).json({
//           success: false,
//           message: `Only ${availableQuantity} seats available for cart item ${item.cart_item_id}`,
//           itemId: item.cart_item_id,
//           availableQuantity,
//         });
//       }
//     }

//     // Begin transaction
//     await query("START TRANSACTION");

//     try {
//       const createdBookings = [];

//       // Create bookings for each cart item
//       for (const item of cartItems) {
//         // Create booking record
//         const bookingResult = await query(
//           `
//           INSERT INTO bookings
//           (customer_id, shop_id, seat_type_id, day_id, quantity, total_price, status)
//           VALUES (?, ?, ?, ?, ?, ?, 'pending')
//           `,
//           [
//             customerId,
//             item.shop_id,
//             item.seat_type_id,
//             item.day_id,
//             item.quantity,
//             item.total_price,
//           ]
//         );

//         const bookingId = bookingResult.insertId;

//         // Log activity
//         await query(
//           "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'booking_created', ?, ?, 'booking')",
//           [
//             req.user.id,
//             req.user.role,
//             `Created booking for ${item.quantity} seats`,
//             bookingId,
//           ]
//         );

//         // Get booking details
//         const [bookingDetails] = await query(
//           `
//           SELECT b.booking_id, b.customer_id, b.shop_id, b.seat_type_id, 
//                  b.day_id, b.quantity, b.total_price, b.status, b.created_at,
//                  s.name as shop_name, 
//                  st.name as seat_type_name,
//                  pd.date as procession_date
//           FROM bookings b
//           JOIN shops s ON b.shop_id = s.shop_id
//           JOIN seat_types st ON b.seat_type_id = st.seat_type_id
//           JOIN procession_days pd ON b.day_id = pd.day_id
//           WHERE b.booking_id = ?
//           `,
//           [bookingId]
//         );

//         createdBookings.push(bookingDetails);

//         // Delete the cart item
//         await query("DELETE FROM cart_items WHERE cart_item_id = ?", [
//           item.cart_item_id,
//         ]);
//       }

//       // Commit transaction
//       await query("COMMIT");

//       return res.status(201).json({
//         success: true,
//         message: "Bookings created successfully",
//         bookings: createdBookings,
//       });
//     } catch (error) {
//       // Rollback transaction on error
//       await query("ROLLBACK");
//       throw error;
//     }
//   } catch (error) {
//     console.error("Error creating booking:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error creating booking",
//       error: error.message,
//     });
//   }
// };


// exports.getMyBookings = async (req, res) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     if (req.user.role !== "customer") {
//       return res.status(403).json({
//         success: false,
//         message: "Only customers can view their bookings",
//       });
//     }

//     // Get customer ID for the user
//     const customerResults = await query(
//       "SELECT customer_id FROM customers WHERE user_id = ?",
//       [req.user.id]
//     );

//     if (customerResults.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Customer profile not found",
//       });
//     }

//     const customerId = customerResults[0].customer_id;

//     // Get bookings with detailed information
//     const bookings = await query(
//       `
//       SELECT b.booking_id, b.customer_id, b.shop_id, b.seat_type_id, 
//              b.day_id, b.quantity, b.total_price, b.status, b.created_at,
//              s.name as shop_name, s.image1 as shop_image, s.street, 
//              s.latitude, s.longitude,
//              st.name as seat_type_name,
//              pd.date as procession_date,
//              p.payment_id, p.amount as payment_amount, p.payment_method,
//              p.status as payment_status, p.created_at as payment_time
//       FROM bookings b
//       JOIN shops s ON b.shop_id = s.shop_id
//       JOIN seat_types st ON b.seat_type_id = st.seat_type_id
//       JOIN procession_days pd ON b.day_id = pd.day_id
//       LEFT JOIN payments p ON b.booking_id = p.booking_id
//       WHERE b.customer_id = ?
//       ORDER BY b.created_at DESC
//       `,
//       [customerId]
//     );

//     // Process image URLs
//     const processedBookings = bookings.map((booking) => ({
//       ...booking,
//       shop_image: booking.shop_image
//         ? generateImageUrl(req, `uploads/shops/${booking.shop_image}`)
//         : null,
//     }));

//     return res.status(200).json({
//       success: true,
//       count: processedBookings.length,
//       bookings: processedBookings,
//     });
//   } catch (error) {
//     console.error("Error fetching bookings:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching bookings",
//       error: error.message,
//     });
//   }
// };


// exports.getBookingById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     const bookingResults = await query(
//       `
//       SELECT b.booking_id, b.customer_id, b.shop_id, b.seat_type_id, 
//              b.day_id, b.quantity, b.total_price, b.status, b.created_at,
//              s.name as shop_name, s.image1 as shop_image, s.street, 
//              s.latitude, s.longitude, s.description as shop_description,
//              st.name as seat_type_name, st.description as seat_type_description,
//              pd.date as procession_date,
//              p.payment_id, p.amount as payment_amount, p.payment_method,
//              p.status as payment_status,
//              p.created_at as payment_time,
//              c.first_name, c.last_name, u.email, u.mobile_number,
//              seller.first_name as seller_first_name, 
//              seller.last_name as seller_last_name,
//              seller_user.mobile_number as seller_mobile
//       FROM bookings b
//       JOIN shops s ON b.shop_id = s.shop_id
//       JOIN seat_types st ON b.seat_type_id = st.seat_type_id
//       JOIN procession_days pd ON b.day_id = pd.day_id
//       LEFT JOIN payments p ON b.booking_id = p.booking_id
//       JOIN customers c ON b.customer_id = c.customer_id
//       JOIN users u ON c.user_id = u.user_id
//       JOIN sellers seller ON s.seller_id = seller.seller_id
//       JOIN users seller_user ON seller.user_id = seller_user.user_id
//       WHERE b.booking_id = ?
//       `,
//       [id]
//     );

//     if (bookingResults.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Booking not found",
//       });
//     }
//     const booking = bookingResults[0];

//     // Process image URLs
//     booking.shop_image = booking.shop_image
//       ? generateImageUrl(req, `uploads/shops/${booking.shop_image}`)
//       : null;

//     return res.status(200).json({
//       success: true,
//       booking,
//     });
//   } catch (error) {
//     console.error("Error fetching booking:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching booking",
//       error: error.message,
//     });
//   }
// };

// exports.updateBookingStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status } = req.body;

//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     if (!["admin", "super_admin", "seller"].includes(req.user.role)) {
//       return res.status(403).json({
//         success: false,
//         message: "Only admins and sellers can update booking status",
//       });
//     }

//     if (
//       !status ||
//       !["pending", "confirmed", "cancelled", "expired"].includes(status)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid status value",
//       });
//     }

//     // Get booking details
//     const bookingResults = await query(
//       `
//       SELECT b.booking_id, b.customer_id, b.shop_id, b.status,
//              s.seller_id
//       FROM bookings b
//       JOIN shops s ON b.shop_id = s.shop_id
//       WHERE b.booking_id = ?
//       `,
//       [id]
//     );

//     if (bookingResults.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Booking not found",
//       });
//     }
//     const booking = bookingResults[0];

//     // If status is already the same, no need to update
//     if (booking.status === status) {
//       return res.status(200).json({
//         success: true,
//         message: `Booking is already ${status}`,
//         booking: { booking_id: booking.booking_id, status },
//       });
//     }

//     // Update booking status
//     await query("UPDATE bookings SET status = ? WHERE booking_id = ?", [
//       status,
//       id,
//     ]);

//     // Log activity
//     await query(
//       "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'booking_status_updated', ?, ?, 'booking')",
//       [req.user.id, req.user.role, `Updated booking status to ${status}`, id]
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Booking status updated successfully",
//       booking: { booking_id: parseInt(id), status },
//     });
//   } catch (error) {
//     console.error("Error updating booking status:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error updating booking status",
//       error: error.message,
//     });
//   }
// };


// exports.cancelMyBooking = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     if (req.user.role !== "customer") {
//       return res.status(403).json({
//         success: false,
//         message: "Only customers can cancel their own bookings",
//       });
//     }

//     // Get customer ID for the user
//     const customerResults = await query(
//       "SELECT customer_id FROM customers WHERE user_id = ?",
//       [req.user.id]
//     );

//     if (customerResults.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Customer profile not found",
//       });
//     }

//     const customerId = customerResults[0].customer_id;

//     // Check if booking exists and belongs to the customer
//     const bookingResults = await query(
//       `
//       SELECT b.booking_id, b.customer_id, b.status,
//              p.payment_id, p.status as payment_status
//       FROM bookings b
//       LEFT JOIN payments p ON b.booking_id = p.booking_id
//       WHERE b.booking_id = ?
//       `,
//       [id]
//     );

//     if (bookingResults.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Booking not found",
//       });
//     }

//     const booking = bookingResults[0];

//     // Verify ownership
//     if (booking.customer_id !== customerId) {
//       return res.status(403).json({
//         success: false,
//         message: "You don't have permission to cancel this booking",
//       });
//     }

//     // Check if booking can be cancelled
//     if (booking.status === "cancelled") {
//       return res.status(400).json({
//         success: false,
//         message: "Booking is already cancelled",
//       });
//     }

//     if (booking.status === "expired") {
//       return res.status(400).json({
//         success: false,
//         message: "Cannot cancel an expired booking",
//       });
//     }

//     // Check payment status
//     if (booking.payment_id && booking.payment_status === "success") {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Cannot cancel a booking with successful payment. Please contact support.",
//       });
//     }

//     // Update booking status to cancelled
//     await query(
//       "UPDATE bookings SET status = 'cancelled' WHERE booking_id = ?",
//       [id]
//     );

//     // If there's a pending payment, mark it as failed
//     if (booking.payment_id && booking.payment_status === "pending") {
//       await query(
//         "UPDATE payments SET status = 'failed' WHERE payment_id = ?",
//         [booking.payment_id]
//       );
//     }

//     // Log activity
//     await query(
//       "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'booking_cancelled', ?, ?, 'booking')",
//       [req.user.id, req.user.role, `Cancelled booking ${id}`, id]
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Booking cancelled successfully",
//       booking: { booking_id: parseInt(id), status: "cancelled" },
//     });
//   } catch (error) {
//     console.error("Error cancelling booking:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error cancelling booking",
//       error: error.message,
//     });
//   }
// };


// exports.getAllBookings = async (req, res) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     if (!["admin", "super_admin", "seller"].includes(req.user.role)) {
//       return res.status(403).json({
//         success: false,
//         message: "Unauthorized access",
//       });
//     }

//     // Extract query parameters for filtering
//     const {
//       shopId,
//       status,
//       dayId,
//       startDate,
//       endDate,
//       customerId,
//       limit,
//       offset = 0,
//     } = req.query;

//     let queryConditions = [];
//     const queryParams = [];

//     // For sellers, only show bookings for their shops
//     if (req.user.role === "seller") {
//       // Get seller ID
//       const sellerResults = await query(
//         "SELECT seller_id FROM sellers WHERE user_id = ?",
//         [req.user.id]
//       );

//       if (sellerResults.length === 0) {
//         return res.status(404).json({
//           success: false,
//           message: "Seller profile not found",
//         });
//       }

//       const sellerId = sellerResults[0].seller_id;

//       queryConditions.push("s.seller_id = ?");
//       queryParams.push(sellerId);
//     }

//     // Apply filters
//     if (shopId) {
//       queryConditions.push("b.shop_id = ?");
//       queryParams.push(shopId);
//     }

//     if (status) {
//       queryConditions.push("b.status = ?");
//       queryParams.push(status);
//     }

//     if (dayId) {
//       queryConditions.push("b.day_id = ?");
//       queryParams.push(dayId);
//     }

//     if (startDate) {
//       queryConditions.push("b.created_at >= ?");
//       queryParams.push(startDate);
//     }

//     if (endDate) {
//       queryConditions.push("b.created_at <= ?");
//       queryParams.push(endDate);
//     }

//     if (customerId) {
//       queryConditions.push("b.customer_id = ?");
//       queryParams.push(customerId);
//     }

//     // Construct WHERE clause
//     const whereClause =
//       queryConditions.length > 0
//         ? "WHERE " + queryConditions.join(" AND ")
//         : "";

//     // Get bookings count first
//     const countQuery = `
//       SELECT COUNT(*) as total
//       FROM bookings b
//       JOIN shops s ON b.shop_id = s.shop_id
//       ${whereClause}
//     `;

//     const countResult = await query(countQuery, queryParams);
//     const total = countResult[0].total;

//     // Construct main query
//     let mainQuery = `
//       SELECT b.booking_id, b.customer_id, b.shop_id, b.seat_type_id, 
//              b.day_id, b.quantity, b.total_price, b.status, b.created_at,
//              s.name as shop_name, s.image1 as shop_image,
//              st.name as seat_type_name,
//              pd.date as procession_date,
//              CONCAT(c.first_name, ' ', c.last_name) as customer_name,
//              u.email as customer_email, u.mobile_number as customer_phone,
//              p.payment_id, p.status as payment_status, 
//              p.payment_method, p.created_at as payment_time
//       FROM bookings b
//       JOIN shops s ON b.shop_id = s.shop_id
//       JOIN seat_types st ON b.seat_type_id = st.seat_type_id
//       JOIN procession_days pd ON b.day_id = pd.day_id
//       JOIN customers c ON b.customer_id = c.customer_id
//       JOIN users u ON c.user_id = u.user_id
//       LEFT JOIN payments p ON b.booking_id = p.booking_id
//       ${whereClause}
//       ORDER BY b.created_at DESC
//     `;

//     // Add limit and offset if provided
//     if (limit) {
//       mainQuery += " LIMIT ? OFFSET ?";
//       queryParams.push(parseInt(limit), parseInt(offset));
//     }

//     const bookings = await query(mainQuery, queryParams);

//     // Process image URLs
//     const processedBookings = bookings.map((booking) => ({
//       ...booking,
//       shop_image: booking.shop_image
//         ? generateImageUrl(req, `uploads/shops/${booking.shop_image}`)
//         : null,
//     }));

//     return res.status(200).json({
//       success: true,
//       total,
//       count: processedBookings.length,
//       bookings: processedBookings,
//     });
//   } catch (error) {
//     console.error("Error fetching bookings:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching bookings",
//       error: error.message,
//     });
//   }
// };


// exports.getBookingsByUserId = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     // Users can only see their own bookings unless they are admin/seller
//     if (req.user.role === "customer" && req.user.id !== parseInt(userId)) {
//       return res.status(403).json({
//         success: false,
//         message: "Unauthorized: You can only view your own bookings",
//       });
//     }

//     // For sellers, check if they can see this user's bookings for their shops
//     if (req.user.role === "seller") {
//       const sellerResults = await query(
//         "SELECT seller_id FROM sellers WHERE user_id = ?",
//         [req.user.id]
//       );

//       if (sellerResults.length === 0) {
//         return res.status(404).json({
//           success: false,
//           message: "Seller profile not found",
//         });
//       }
//     }

//     // Get customer ID from user ID
//     const customerResults = await query(
//       "SELECT customer_id FROM customers WHERE user_id = ?",
//       [userId]
//     );

//     if (customerResults.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Customer not found",
//       });
//     }

//     const customerId = customerResults[0].customer_id;

//     // Base query
//     let sql = `
//       SELECT b.booking_id, b.quantity, b.total_price, b.status, b.created_at,
//              s.name as shop_name, s.street as shop_street,
//              st.name as seat_type_name, st.price as seat_type_price,
//              pd.date as procession_date, pd.name as procession_day_name
//       FROM bookings b
//       JOIN shops s ON b.shop_id = s.shop_id
//       JOIN seat_types st ON b.seat_type_id = st.seat_type_id
//       JOIN procession_days pd ON b.day_id = pd.day_id
//       WHERE b.customer_id = ?
//     `;

//     const queryParams = [customerId];

//     // For sellers, only show bookings for their shops
//     if (req.user.role === "seller") {
//       sql += " AND s.seller_id = ?";
//       queryParams.push(sellerResults[0].seller_id);
//     }

//     sql += " ORDER BY b.created_at DESC";

//     const bookings = await query(sql, queryParams);

//     return res.status(200).json({
//       success: true,
//       count: bookings.length,
//       bookings,
//     });
//   } catch (error) {
//     console.error("Error fetching bookings by user ID:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching bookings",
//       error: error.message,
//     });
//   }
// };


// exports.getBookingsByShopId = async (req, res) => {
//   try {
//     const { shopId } = req.params;

//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     // Check if shop exists and get seller info
//     const shopResults = await query(
//       "SELECT shop_id, seller_id FROM shops WHERE shop_id = ?",
//       [shopId]
//     );

//     if (shopResults.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Shop not found",
//       });
//     }
//     const shop = shopResults[0];

//     const bookings = await query(
//       `
//       SELECT b.booking_id, b.quantity, b.total_price, b.status, b.created_at,
//              s.name as shop_name, s.street as shop_street,
//              st.name as seat_type_name, st.price as seat_type_price,
//              pd.date as procession_date, pd.name as procession_day_name,
//              c.first_name as customer_first_name, c.last_name as customer_last_name
//       FROM bookings b
//       JOIN shops s ON b.shop_id = s.shop_id
//       JOIN seat_types st ON b.seat_type_id = st.seat_type_id
//       JOIN procession_days pd ON b.day_id = pd.day_id
//       JOIN customers c ON b.customer_id = c.customer_id
//       WHERE b.shop_id = ?
//       ORDER BY b.created_at DESC
//       `,
//       [shopId]
//     );

//     return res.status(200).json({
//       success: true,
//       count: bookings.length,
//       bookings,
//     });
//   } catch (error) {
//     console.error("Error fetching bookings by shop ID:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching bookings",
//       error: error.message,
//     });
//   }
// };


// exports.getBookingsByDateRange = async (req, res) => {
//   try {
//     const { startDate, endDate } = req.query;

//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     if (!["admin", "super_admin"].includes(req.user.role)) {
//       return res.status(403).json({
//         success: false,
//         message: "Unauthorized: Admin access required",
//       });
//     }

//     if (!startDate || !endDate) {
//       return res.status(400).json({
//         success: false,
//         message: "Start date and end date are required",
//       });
//     }

//     const bookings = await query(
//       `
//       SELECT b.booking_id, b.quantity, b.total_price, b.status, b.created_at,
//              s.name as shop_name, s.street as shop_street,
//              st.name as seat_type_name, st.price as seat_type_price,
//              pd.date as procession_date, pd.name as procession_day_name,
//              c.first_name as customer_first_name, c.last_name as customer_last_name
//       FROM bookings b
//       JOIN shops s ON b.shop_id = s.shop_id
//       JOIN seat_types st ON b.seat_type_id = st.seat_type_id
//       JOIN procession_days pd ON b.day_id = pd.day_id
//       JOIN customers c ON b.customer_id = c.customer_id
//       WHERE b.created_at >= ? AND b.created_at <= ?
//       ORDER BY b.created_at DESC
//       `,
//       [startDate, endDate]
//     );

//     return res.status(200).json({
//       success: true,
//       count: bookings.length,
//       bookings,
//     });
//   } catch (error) {
//     console.error("Error fetching bookings by date range:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching bookings",
//       error: error.message,
//     });
//   }
// };


// exports.updateBooking = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status } = req.body;

//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     if (
//       !status ||
//       !["pending", "confirmed", "cancelled", "expired"].includes(status)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid status value",
//       });
//     }

//     // Get booking details
//     const bookingResults = await query(
//       `
//       SELECT b.booking_id, b.customer_id, b.shop_id, b.status,
//              s.seller_id, c.user_id as customer_user_id
//       FROM bookings b
//       JOIN shops s ON b.shop_id = s.shop_id
//       JOIN customers c ON b.customer_id = c.customer_id
//       WHERE b.booking_id = ?
//       `,
//       [id]
//     );

//     if (bookingResults.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Booking not found",
//       });
//     }
//     const booking = bookingResults[0];

//     // Don't allow updating already processed bookings
//     if (booking.status === "confirmed" && status === "pending") {
//       return res.status(400).json({
//         success: false,
//         message: "Cannot change confirmed booking back to pending",
//       });
//     }

//     // Update booking status
//     await query("UPDATE bookings SET status = ? WHERE booking_id = ?", [
//       status,
//       id,
//     ]);

//     // Log activity
//     await query(
//       "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'booking_updated', ?, ?, 'booking')",
//       [
//         req.user.id,
//         req.user.role,
//         `Updated booking ${id} status to ${status}`,
//         id,
//       ]
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Booking updated successfully",
//       booking: { booking_id: parseInt(id), status },
//     });
//   } catch (error) {
//     console.error("Error updating booking:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error updating booking",
//       error: error.message,
//     });
//   }
// };


// exports.deleteBooking = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     // Get booking details
//     const bookingResults = await query(
//       `
//       SELECT b.booking_id, b.customer_id, b.shop_id, b.status,
//              s.seller_id, c.user_id as customer_user_id
//       FROM bookings b
//       JOIN shops s ON b.shop_id = s.shop_id
//       JOIN customers c ON b.customer_id = c.customer_id
//       WHERE b.booking_id = ?
//       `,
//       [id]
//     );

//     if (bookingResults.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Booking not found",
//       });
//     }
//     const booking = bookingResults[0];

//     // Check if booking has associated payments
//     const paymentsResult = await query(
//       "SELECT COUNT(*) as count FROM payments WHERE booking_id = ?",
//       [id]
//     );

//     if (paymentsResult[0].count > 0) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Cannot delete booking with associated payments. Cancel instead.",
//       });
//     }

//     // Begin transaction
//     await query("START TRANSACTION");

//     try {
//       // Delete the booking
//       await query("DELETE FROM bookings WHERE booking_id = ?", [id]);

//       // Log activity
//       await query(
//         "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'booking_deleted', ?, ?, 'booking')",
//         [req.user.id, req.user.role, `Deleted booking ${id}`, id]
//       );

//       // Commit transaction
//       await query("COMMIT");

//       return res.status(200).json({
//         success: true,
//         message: "Booking deleted successfully",
//       });
//     } catch (error) {
//       // Rollback transaction on error
//       await query("ROLLBACK");
//       throw error;
//     }
//   } catch (error) {
//     console.error("Error deleting booking:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error deleting booking",
//       error: error.message,
//     });
//   }
// };


// exports.createDirectBooking = async (req, res) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     const { customer_id, shop_id, seat_type_id, day_id, quantity, price } = req.body;

//     // Validate required fields
//     if (!customer_id || !shop_id || !seat_type_id || !day_id || !quantity || !price) {
//       return res.status(400).json({
//         success: false,
//         message: "All booking details are required",
//       });
//     }

//     // Check seat availability
//     const availabilityResults = await query(
//       `SELECT quantity, available 
//        FROM seat_type_availability 
//        WHERE seat_type_id = ? AND day_id = ?`,
//       [seat_type_id, day_id]
//     );

//     if (availabilityResults.length === 0 || !availabilityResults[0].available) {
//       return res.status(400).json({
//         success: false,
//         message: "Selected seat type is not available for this date",
//       });
//     }

//     const availability = availabilityResults[0];
//     const totalPrice = price * quantity;

//     // Check existing bookings
//     const bookedQuantity = await query(
//       `SELECT COALESCE(SUM(quantity), 0) as booked_quantity
//        FROM bookings
//        WHERE seat_type_id = ? AND day_id = ? AND status IN ('pending', 'confirmed')`,
//       [seat_type_id, day_id]
//     );

//     const totalBooked = parseInt(bookedQuantity[0].booked_quantity);
//     const availableQuantity = availability.quantity - totalBooked;

//     if (quantity > availableQuantity) {
//       return res.status(400).json({
//         success: false,
//         message: `Only ${availableQuantity} seats available`,
//         availableQuantity,
//       });
//     }

//     // Create booking
//     const bookingResult = await query(
//       `INSERT INTO bookings
//        (customer_id, shop_id, seat_type_id, day_id, quantity, total_price, status)
//        VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`,
//       [customer_id, shop_id, seat_type_id, day_id, quantity, totalPrice]
//     );

//     const bookingId = bookingResult.insertId;

//     // Log activity
//     await query(
//       `INSERT INTO activity_logs 
//        (user_id, role, action_type, description, affected_entity_id, entity_type) 
//        VALUES (?, ?, 'booking_created', ?, ?, 'booking')`,
//       [
//         req.user.id,
//         req.user.role,
//         `Created direct booking for ${quantity} seats`,
//         bookingId,
//       ]
//     );

//     return res.status(201).json({
//       success: true,
//       message: "Booking created successfully",
//       booking: {
//         booking_id: bookingId,
//         customer_id,
//         shop_id,
//         seat_type_id,
//         day_id,
//         quantity,
//         total_price: totalPrice,
//         status: 'confirmed'
//       }
//     });

//   } catch (error) {
//     console.error("Error creating direct booking:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error creating booking",
//       error: error.message,
//     });
//   }
// };






















const { query } = require("../../config/database-schema");

/**
 * Helper function to generate image URLs
 */
const generateImageUrl = (req, filePath) => {
  if (!filePath) return null;

  // If filePath is already a full URL, return it as-is
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }

  // Check if the filePath contains a full URL within it (for cases like "uploads/shops/https://...")
  const urlMatch = filePath.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Otherwise, generate local server URL
  return `${req.protocol}://${req.get("host")}/${filePath.replace(/\\/g, "/")}`;
};

/**
 * Create a new booking from cart items
 */
exports.createBooking = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { cartItemIds } = req.body;

    if (!cartItemIds || !Array.isArray(cartItemIds) || cartItemIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart item IDs are required",
      });
    }

    // Use user_id directly (customer_id now links to users.user_id)
    const customerId = req.user.id;

    console.log(`📋 Creating booking for user ${customerId} with cart items:`, cartItemIds);

    // Get cart items to book
    const cartItemsQuery = `
      SELECT ci.cart_item_id, ci.shop_id, ci.seat_type_id, ci.day_id,
             ci.quantity, ci.price_per_seat, ci.total_price, ci.expires_at
      FROM cart_items ci
      WHERE ci.cart_item_id IN (?) AND ci.customer_id = ?
    `;

    const cartItems = await query(cartItemsQuery, [cartItemIds, customerId]);

    if (cartItems.length === 0) {
      console.log(`⚠️ No valid cart items found for user ${customerId}`);
      return res.status(404).json({
        success: false,
        message: "No valid cart items found",
      });
    }

    console.log(`✅ Found ${cartItems.length} cart items to book`);

    // Check if any cart items have expired
    const now = new Date();
    const expiredItems = cartItems.filter(
      (item) => item.expires_at && new Date(item.expires_at) < now
    );

    if (expiredItems.length > 0) {
      console.log(`⚠️ Found ${expiredItems.length} expired cart items`);
      return res.status(400).json({
        success: false,
        message: "Some cart items have expired",
        expiredItems: expiredItems.map((item) => item.cart_item_id),
      });
    }

    // Verify availability for each cart item
    for (const item of cartItems) {
      // Check seat type availability
      const availabilityResults = await query(
        `
        SELECT sta.quantity, sta.available
        FROM seat_type_availability sta
        WHERE sta.seat_type_id = ? AND sta.day_id = ?
        `,
        [item.seat_type_id, item.day_id]
      );

      if (availabilityResults.length === 0 || !availabilityResults[0].available) {
        return res.status(400).json({
          success: false,
          message: `Seat type for cart item ${item.cart_item_id} is no longer available`,
          unavailableItemId: item.cart_item_id,
        });
      }

      const availability = availabilityResults[0];

      // Check existing bookings
      const bookedQuantity = await query(
        `
        SELECT COALESCE(SUM(quantity), 0) as booked_quantity
        FROM bookings
        WHERE seat_type_id = ? AND day_id = ? AND status IN ('pending', 'confirmed')
        `,
        [item.seat_type_id, item.day_id]
      );

      const totalBooked = parseInt(bookedQuantity[0].booked_quantity);
      const availableQuantity = availability.quantity - totalBooked;

      if (item.quantity > availableQuantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${availableQuantity} seats available for cart item ${item.cart_item_id}`,
          itemId: item.cart_item_id,
          availableQuantity,
        });
      }
    }

    // Begin transaction
    await query("START TRANSACTION");

    try {
      const createdBookings = [];

      // Create bookings for each cart item
      for (const item of cartItems) {
        // Create booking record with expires_at set to 15 minutes from now
        const bookingResult = await query(
          `
          INSERT INTO bookings
          (customer_id, shop_id, seat_type_id, day_id, quantity, total_price, status, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 15 MINUTE))
          `,
          [
            customerId,
            item.shop_id,
            item.seat_type_id,
            item.day_id,
            item.quantity,
            item.total_price,
          ]
        );

        const bookingId = bookingResult.insertId;

        // Get booking details
        const [bookingDetails] = await query(
          `
          SELECT b.booking_id, b.customer_id, b.shop_id, b.seat_type_id, 
                 b.day_id, b.quantity, b.total_price, b.status, b.created_at,
                 s.name as shop_name, 
                 st.name as seat_type_name,
                 pd.date as procession_date
          FROM bookings b
          JOIN shops s ON b.shop_id = s.shop_id
          JOIN seat_types st ON b.seat_type_id = st.seat_type_id
          JOIN procession_days pd ON b.day_id = pd.day_id
          WHERE b.booking_id = ?
          `,
          [bookingId]
        );

        createdBookings.push(bookingDetails);

        // Delete the cart item
        await query("DELETE FROM cart_items WHERE cart_item_id = ?", [
          item.cart_item_id,
        ]);
      }

      // Commit transaction
      await query("COMMIT");

      return res.status(201).json({
        success: true,
        message: "Bookings created successfully",
        bookings: createdBookings,
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error creating booking:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating booking",
      error: error.message,
    });
  }
};

/**
 * Get my bookings
 */
exports.getMyBookings = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Use user_id directly (customer_id now links to users.user_id)
    const customerId = req.user.id;

    console.log(`📋 Getting bookings for user ${customerId}`);

    // Get bookings with detailed information
    const bookings = await query(
      `
      SELECT b.booking_id, b.customer_id, b.shop_id, b.seat_type_id, 
             b.day_id, b.quantity, b.total_price, b.status, b.created_at,
             s.name as shop_name, s.image1 as shop_image, s.street, 
             s.latitude, s.longitude,
             st.name as seat_type_name,
             pd.date as procession_date,
             p.payment_id, p.amount as payment_amount, p.payment_method,
             p.status as payment_status, p.payhere_payment_id, p.payhere_order_id,
             p.created_at as payment_time
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      WHERE b.customer_id = ?
      ORDER BY b.created_at DESC
      `,
      [customerId]
    );

    console.log(`✅ Found ${bookings.length} bookings for user ${customerId}`);

    // Process image URLs
    const processedBookings = bookings.map((booking) => ({
      ...booking,
      shop_image: booking.shop_image
        ? generateImageUrl(req, `uploads/shops/${booking.shop_image}`)
        : null,
    }));

    return res.status(200).json({
      success: true,
      count: processedBookings.length,
      bookings: processedBookings,
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching bookings",
      error: error.message,
    });
  }
};

/**
 * Get booking by ID
 */
/**
 * Get booking by ID
 */
exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Get booking details
    const bookingResults = await query(
      `
      SELECT b.booking_id, b.customer_id, b.shop_id, b.seat_type_id, 
             b.day_id, b.quantity, b.total_price, b.status, b.created_at,
             s.name as shop_name, s.image1 as shop_image, s.street, 
             s.latitude, s.longitude, s.description as shop_description,
             st.name as seat_type_name, st.description as seat_type_description,
             pd.date as procession_date,
             p.payment_id, p.amount as payment_amount, p.payment_method,
             p.status as payment_status, p.payhere_payment_id, p.payhere_order_id,
             p.created_at as payment_time,
             c.first_name, c.last_name, u.email, u.mobile_number,
             seller.first_name as seller_first_name, 
             seller.last_name as seller_last_name,
             seller_user.mobile_number as seller_mobile
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN customers c ON u.user_id = c.user_id
      JOIN sellers seller ON s.seller_id = seller.seller_id
      JOIN users seller_user ON seller.user_id = seller_user.user_id
      WHERE b.booking_id = ?
      `,
      [id]
    );

    if (bookingResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }
    const booking = bookingResults[0];

    // Process image URLs
    booking.shop_image = booking.shop_image
      ? generateImageUrl(req, `uploads/shops/${booking.shop_image}`)
      : null;

    return res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    console.error("Error fetching booking:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching booking",
      error: error.message,
    });
  }
};
/**
 * Update booking status
 */
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!["admin", "super_admin", "seller"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Only admins and sellers can update booking status",
      });
    }

    if (!status || !["pending", "confirmed", "cancelled", "expired"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    // Get booking details
    const bookingResults = await query(
      `
      SELECT b.booking_id, b.customer_id, b.shop_id, b.status,
             s.seller_id
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      WHERE b.booking_id = ?
      `,
      [id]
    );

    if (bookingResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }
    const booking = bookingResults[0];

    // If status is already the same, no need to update
    if (booking.status === status) {
      return res.status(200).json({
        success: true,
        message: `Booking is already ${status}`,
        booking: { booking_id: booking.booking_id, status },
      });
    }

    // Update booking status
    await query("UPDATE bookings SET status = ? WHERE booking_id = ?", [
      status,
      id,
    ]);

    // Log activity
    await query(
      "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'booking_status_updated', ?, ?, 'booking')",
      [req.user.id, req.user.role, `Updated booking status to ${status}`, id]
    );

    return res.status(200).json({
      success: true,
      message: "Booking status updated successfully",
      booking: { booking_id: parseInt(id), status },
    });
  } catch (error) {
    console.error("Error updating booking status:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating booking status",
      error: error.message,
    });
  }
};

/**
 * Cancel my booking (customer only)
 */
exports.cancelMyBooking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Use user_id directly (customer_id now links to users.user_id)
    const customerId = req.user.id;

    console.log(`📋 Cancelling booking ${id} for user ${customerId}`);

    // Check if booking exists and belongs to the customer
    const bookingResults = await query(
      `
      SELECT b.booking_id, b.customer_id, b.status,
             p.payment_id, p.status as payment_status
      FROM bookings b
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      WHERE b.booking_id = ?
      `,
      [id]
    );

    if (bookingResults.length === 0) {
      console.log(`⚠️ Booking ${id} not found`);
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const booking = bookingResults[0];

    // Verify ownership
    if (booking.customer_id !== customerId) {
      console.log(
        `⚠️ User ${customerId} doesn't own booking ${id} (owner: ${booking.customer_id})`
      );
      return res.status(403).json({
        success: false,
        message: "You don't have permission to cancel this booking",
      });
    }

    // Check if booking can be cancelled
    if (booking.status === "cancelled") {
      console.log(`⚠️ Booking ${id} is already cancelled`);
      return res.status(400).json({
        success: false,
        message: "Booking is already cancelled",
      });
    }

    if (booking.status === "expired") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel an expired booking",
      });
    }

    // Check payment status
    if (booking.payment_id && booking.payment_status === "success") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot cancel a booking with successful payment. Please contact support.",
      });
    }

    // Update booking status to cancelled
    await query(
      "UPDATE bookings SET status = 'cancelled' WHERE booking_id = ?",
      [id]
    );

    // If there's a pending payment, mark it as failed
    if (booking.payment_id && booking.payment_status === "pending") {
      await query(
        "UPDATE payments SET status = 'failed' WHERE payment_id = ?",
        [booking.payment_id]
      );
    }

    // Log activity
    await query(
      "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'booking_cancelled', ?, ?, 'booking')",
      [req.user.id, req.user.role, `Cancelled booking ${id}`, id]
    );

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      booking: { booking_id: parseInt(id), status: "cancelled" },
    });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    return res.status(500).json({
      success: false,
      message: "Error cancelling booking",
      error: error.message,
    });
  }
};

/**
 * Get all bookings (admin or seller)
 */
exports.getAllBookings = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!["admin", "super_admin", "seller"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // Extract query parameters for filtering
    const {
      shopId,
      status,
      dayId,
      startDate,
      endDate,
      customerId,
      limit,
      offset = 0,
    } = req.query;

    let queryConditions = [];
    const queryParams = [];

    // For sellers, only show bookings for their shops
    if (req.user.role === "seller") {
      // Get seller ID
      const sellerResults = await query(
        "SELECT seller_id FROM sellers WHERE user_id = ?",
        [req.user.id]
      );

      if (sellerResults.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Seller profile not found",
        });
      }

      const sellerId = sellerResults[0].seller_id;

      queryConditions.push("s.seller_id = ?");
      queryParams.push(sellerId);
    }

    // Apply filters
    if (shopId) {
      queryConditions.push("b.shop_id = ?");
      queryParams.push(shopId);
    }

    if (status) {
      queryConditions.push("b.status = ?");
      queryParams.push(status);
    }

    if (dayId) {
      queryConditions.push("b.day_id = ?");
      queryParams.push(dayId);
    }

    if (startDate) {
      queryConditions.push("b.created_at >= ?");
      queryParams.push(startDate);
    }

    if (endDate) {
      queryConditions.push("b.created_at <= ?");
      queryParams.push(endDate);
    }

    if (customerId) {
      queryConditions.push("b.customer_id = ?");
      queryParams.push(customerId);
    }

    // Construct WHERE clause
    const whereClause =
      queryConditions.length > 0
        ? "WHERE " + queryConditions.join(" AND ")
        : "";

    // Get bookings count first
    const countQuery = `
      SELECT COUNT(*) as total
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      ${whereClause}
    `;

    const countResult = await query(countQuery, queryParams);
    const total = countResult[0].total;

    // Construct main query
    let mainQuery = `
      SELECT b.booking_id, b.customer_id, b.shop_id, b.seat_type_id, 
             b.day_id, b.quantity, b.total_price, b.status, b.created_at,
             s.name as shop_name, s.image1 as shop_image,
             st.name as seat_type_name,
             pd.date as procession_date,
             CONCAT(c.first_name, ' ', c.last_name) as customer_name,
             u.email as customer_email, u.mobile_number as customer_phone,
             p.payment_id, p.status as payment_status, 
             p.payment_method, p.payhere_payment_id, p.payhere_order_id,
             p.created_at as payment_time
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN customers c ON u.user_id = c.user_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      ${whereClause}
      ORDER BY b.created_at DESC
    `;

    // Add limit and offset if provided
    if (limit) {
      mainQuery += " LIMIT ? OFFSET ?";
      queryParams.push(parseInt(limit), parseInt(offset));
    }

    const bookings = await query(mainQuery, queryParams);

    // Process image URLs
    const processedBookings = bookings.map((booking) => ({
      ...booking,
      shop_image: booking.shop_image
        ? generateImageUrl(req, `uploads/shops/${booking.shop_image}`)
        : null,
    }));

    return res.status(200).json({
      success: true,
      total,
      count: processedBookings.length,
      bookings: processedBookings,
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching bookings",
      error: error.message,
    });
  }
};

/**
 * Get bookings by user ID
 */
exports.getBookingsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Users can only see their own bookings unless they are admin/seller
    if (req.user.role === "customer" && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You can only view your own bookings",
      });
    }

    // For sellers, check if they can see this user's bookings for their shops
    if (req.user.role === "seller") {
      const sellerResults = await query(
        "SELECT seller_id FROM sellers WHERE user_id = ?",
        [req.user.id]
      );

      if (sellerResults.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Seller profile not found",
        });
      }
    }

    // Get customer ID from user ID - now customer_id directly links to users.user_id
    const userResults = await query(
      "SELECT user_id, role FROM users WHERE user_id = ? AND role = 'customer'",
      [userId]
    );

    if (userResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Use userId directly as customerId (customer_id now links to users.user_id)
    const customerId = parseInt(userId);

    console.log(`📋 Getting bookings for customer user ${customerId}`);

    // Base query
    let sql = `
      SELECT b.booking_id, b.quantity, b.total_price, b.status, b.created_at,
             s.name as shop_name, s.street as shop_street,
             st.name as seat_type_name, st.price as seat_type_price,
             pd.date as procession_date, pd.name as procession_day_name
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      WHERE b.customer_id = ?
    `;

    const queryParams = [customerId];

    // For sellers, only show bookings for their shops
    if (req.user.role === "seller") {
      sql += " AND s.seller_id = ?";
      queryParams.push(sellerResults[0].seller_id);
    }

    sql += " ORDER BY b.created_at DESC";

    const bookings = await query(sql, queryParams);

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Error fetching bookings by user ID:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching bookings",
      error: error.message,
    });
  }
};

/**
 * Get bookings by shop ID
 */
exports.getBookingsByShopId = async (req, res) => {
  try {
    const { shopId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if shop exists and get seller info
    const shopResults = await query(
      "SELECT shop_id, seller_id FROM shops WHERE shop_id = ?",
      [shopId]
    );

    if (shopResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }
    const shop = shopResults[0];

    const bookings = await query(
      `
      SELECT b.booking_id, b.quantity, b.total_price, b.status, b.created_at,
             s.name as shop_name, s.street as shop_street,
             st.name as seat_type_name, st.price as seat_type_price,
             pd.date as procession_date, pd.name as procession_day_name,
             c.first_name as customer_first_name, c.last_name as customer_last_name
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN customers c ON u.user_id = c.user_id
      WHERE b.shop_id = ?
      ORDER BY b.created_at DESC
      `,
      [shopId]
    );

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Error fetching bookings by shop ID:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching bookings",
      error: error.message,
    });
  }
};

/**
 * Get bookings by date range
 */
exports.getBookingsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!["admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Admin access required",
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const bookings = await query(
      `
      SELECT b.booking_id, b.quantity, b.total_price, b.status, b.created_at,
             s.name as shop_name, s.street as shop_street,
             st.name as seat_type_name, st.price as seat_type_price,
             pd.date as procession_date, pd.name as procession_day_name,
             c.first_name as customer_first_name, c.last_name as customer_last_name
      FROM bookings b
      JOIN shops s ON b.shop_id = s.shop_id
      JOIN seat_types st ON b.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON b.day_id = pd.day_id
      JOIN users u ON b.customer_id = u.user_id
      LEFT JOIN customers c ON u.user_id = c.user_id
      WHERE b.created_at >= ? AND b.created_at <= ?
      ORDER BY b.created_at DESC
      `,
      [startDate, endDate]
    );

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Error fetching bookings by date range:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching bookings",
      error: error.message,
    });
  }
};

exports.updateBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, status, total_price, date, seat_type_id } = req.body; // Changed from procession_date to date

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Get booking details
    const bookingResults = await query(
      `SELECT b.booking_id, b.day_id, b.status
       FROM bookings b
       WHERE b.booking_id = ?`,
      [id]
    );

    if (bookingResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Update procession date if provided
    if (date) {
      await query(
        `UPDATE procession_days pd
         JOIN bookings b ON pd.day_id = b.day_id
         SET pd.date = ?
         WHERE b.booking_id = ?`,
        [date, id]
      );
    }

    // Update booking details
    await query(
      `UPDATE bookings 
       SET quantity = ?, 
           status = ?, 
           total_price = ?, 
           seat_type_id = ? 
       WHERE booking_id = ?`,
      [quantity, status, total_price, seat_type_id, id]
    );

    // Get updated booking
    const [updatedBooking] = await query(
      `SELECT b.*, s.name as shop_name, st.name as seat_type_name, 
              pd.date as procession_date
       FROM bookings b
       JOIN shops s ON b.shop_id = s.shop_id
       JOIN seat_types st ON b.seat_type_id = st.seat_type_id
       JOIN procession_days pd ON b.day_id = pd.day_id
       WHERE b.booking_id = ?`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Booking updated successfully",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Error updating booking:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating booking",
      error: error.message,
    });
  }
};

// Delete booking
exports.deleteBooking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if booking exists
    const bookingResults = await query(
      "SELECT booking_id FROM bookings WHERE booking_id = ?",
      [id]
    );

    if (bookingResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Check if booking has associated payments
    const paymentsResult = await query(
      "SELECT COUNT(*) as count FROM payments WHERE booking_id = ?",
      [id]
    );

    if (paymentsResult[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete booking with associated payments. Cancel instead.",
      });
    }

    // Begin transaction
    await query("START TRANSACTION");

    try {
      // Delete the booking
      await query("DELETE FROM bookings WHERE booking_id = ?", [id]);

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'booking_deleted', ?, ?, 'booking')",
        [req.user.id, req.user.role, `Deleted booking ${id}`, id]
      );

      // Commit transaction
      await query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Booking deleted successfully",
      });
    } catch (error) {
      // Rollback transaction on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error deleting booking:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting booking",
      error: error.message,
    });
  }
};



exports.createDirectBooking = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { customer_id, shop_id, seat_type_id, day_id, quantity, price } = req.body;

    // Validate required fields
    if (!customer_id || !shop_id || !seat_type_id || !day_id || !quantity || !price) {
      return res.status(400).json({
        success: false,
        message: "All booking details are required",
      });
    }

    // Check seat availability
    const availabilityResults = await query(
      `SELECT quantity, available 
       FROM seat_type_availability 
       WHERE seat_type_id = ? AND day_id = ?`,
      [seat_type_id, day_id]
    );

    if (availabilityResults.length === 0 || !availabilityResults[0].available) {
      return res.status(400).json({
        success: false,
        message: "Selected seat type is not available for this date",
      });
    }

    const availability = availabilityResults[0];
    const totalPrice = price * quantity;

    // Check existing bookings
    const bookedQuantity = await query(
      `SELECT COALESCE(SUM(quantity), 0) as booked_quantity
       FROM bookings
       WHERE seat_type_id = ? AND day_id = ? AND status IN ('pending', 'confirmed')`,
      [seat_type_id, day_id]
    );

    const totalBooked = parseInt(bookedQuantity[0].booked_quantity);
    const availableQuantity = availability.quantity - totalBooked;

    if (quantity > availableQuantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableQuantity} seats available`,
        availableQuantity,
      });
    }

    // Create booking
    const bookingResult = await query(
      `INSERT INTO bookings
       (customer_id, shop_id, seat_type_id, day_id, quantity, total_price, status)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`,
      [customer_id, shop_id, seat_type_id, day_id, quantity, totalPrice]
    );

    const bookingId = bookingResult.insertId;

    // Log activity
    await query(
      `INSERT INTO activity_logs 
       (user_id, role, action_type, description, affected_entity_id, entity_type) 
       VALUES (?, ?, 'booking_created', ?, ?, 'booking')`,
      [
        req.user.id,
        req.user.role,
        `Created direct booking for ${quantity} seats`,
        bookingId,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking: {
        booking_id: bookingId,
        customer_id,
        shop_id,
        seat_type_id,
        day_id,
        quantity,
        total_price: totalPrice,
        status: 'confirmed'
      }
    });

  } catch (error) {
    console.error("Error creating direct booking:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating booking",
      error: error.message,
    });
  }
};