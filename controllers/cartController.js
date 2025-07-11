// controllers/cartController.js
const { query } = require("../config/database-schema");

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
 * Helper function to format date as YYYY-MM-DD string
 */
const formatDateString = (date) => {
  if (!date) return null;

  // If it's already a string in the correct format, return it
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // If it's a Date object, format it properly
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // For other cases, try to create a Date object and format it
  try {
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return null;
  }
};

/**
 * Get current user's cart items
 */
exports.getMyCart = async (req, res) => {
  try {
    console.log(
      `🛒 getMyCart - User: ${req.user?.id}, Role: ${req.user?.role}`
    );

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Use user_id directly (customer_id field now links to users.user_id)
    const customerId = req.user.id;
    console.log(`🔍 getMyCart - Using user ID as customer ID: ${customerId}`); // Get cart items with detailed information including available quantity
    const cartItems = await query(
      `
      SELECT ci.cart_item_id, ci.customer_id, ci.shop_id, ci.seat_type_id, ci.day_id,
             ci.quantity, ci.price_per_seat, ci.total_price, ci.created_at, ci.expires_at,
             s.name as shop_name, s.image1 as shop_image, s.latitude, s.longitude,
             st.name as seat_type_name, st.image_url as seat_type_image,
             pd.date as procession_date,
             sta.quantity as total_availability
      FROM cart_items ci
      JOIN shops s ON ci.shop_id = s.shop_id
      JOIN seat_types st ON ci.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON ci.day_id = pd.day_id
      LEFT JOIN seat_type_availability sta ON ci.seat_type_id = sta.seat_type_id AND ci.day_id = sta.day_id
      WHERE ci.customer_id = ?
      ORDER BY ci.created_at DESC
      `,
      [customerId]
    );

    console.log(`📦 getMyCart - Found ${cartItems.length} cart items`);
    console.log(`📦 getMyCart - Raw cart items:`, cartItems);

    // Calculate available quantity for each cart item
    const processedCartItems = [];
    for (const item of cartItems) {
      // Calculate available quantity as per requirements
      let availableQuantity = 999; // Default high value

      if (item.total_availability) {
        // Get booked quantity for this seat type and day
        const bookedQuantity = await query(
          `
          SELECT COALESCE(SUM(quantity), 0) as booked_quantity
          FROM bookings
          WHERE seat_type_id = ? AND day_id = ? AND status IN ('pending', 'confirmed')
          `,
          [item.seat_type_id, item.day_id]
        );

        // Get current user's booking quantity for this item if exists
        const userBookingQuantity = await query(
          `
          SELECT COALESCE(SUM(quantity), 0) as user_booking_quantity
          FROM bookings
          WHERE seat_type_id = ? AND day_id = ? AND customer_id = ? AND status IN ('pending')
          `,
          [item.seat_type_id, item.day_id, customerId]
        );

        // Calculate available quantity: total_availability + user_bookings
        const totalBooked = parseInt(bookedQuantity[0].booked_quantity) || 0;
        const userBooked =
          parseInt(userBookingQuantity[0].user_booking_quantity) || 0;

        // Available = total capacity + user's bookings (as per requirement)
        availableQuantity = parseInt(item.total_availability) + userBooked;

        console.log(
          `🧮 getMyCart - Availability calculation for item ${item.cart_item_id}:`
        );
        console.log(`   Total capacity: ${item.total_availability}`);
        console.log(`   Total booked: ${totalBooked}`);
        console.log(`   User booked: ${userBooked}`);
        console.log(`   Available quantity: ${availableQuantity}`);
      }

      // Process image URLs and ensure numeric types
      const processedItem = {
        ...item,
        // Ensure numeric fields are properly typed
        latitude: parseFloat(item.latitude) || 0.0,
        longitude: parseFloat(item.longitude) || 0.0,
        quantity: parseInt(item.quantity) || 0,
        price_per_seat: parseFloat(item.price_per_seat) || 0.0,
        total_price: parseFloat(item.total_price) || 0.0,
        cart_item_id: parseInt(item.cart_item_id) || 0,
        customer_id: parseInt(item.customer_id) || 0,
        shop_id: parseInt(item.shop_id) || 0,
        seat_type_id: parseInt(item.seat_type_id) || 0,
        day_id: parseInt(item.day_id) || 0,
        // Process image URLs
        shop_image: item.shop_image
          ? generateImageUrl(req, `uploads/shops/${item.shop_image}`)
          : null,
        seat_type_image: item.seat_type_image
          ? generateImageUrl(req, `uploads/seat_types/${item.seat_type_image}`)
          : null,
        // Format procession date
        procession_date: formatDateString(item.procession_date),
        // Add calculated available quantity
        available_quantity: availableQuantity,
      };

      // Remove the total_availability field from response as it's internal
      delete processedItem.total_availability;

      processedCartItems.push(processedItem);
    }

    console.log(`📊 Cart items processed: ${processedCartItems.length} items`);
    console.log(`📊 Sample cart item:`, processedCartItems[0] || "No items");

    // Calculate cart summary
    const itemCount = processedCartItems.length;
    const totalQuantity = processedCartItems.reduce(
      (sum, item) => sum + (parseInt(item.quantity) || 0),
      0
    );
    const totalAmount = processedCartItems.reduce(
      (sum, item) => sum + (parseFloat(item.total_price) || 0.0),
      0
    );
    console.log(
      `📊 Cart summary - Items: ${itemCount}, Quantity: ${totalQuantity}, Total: ${totalAmount}`
    );

    const responseData = {
      success: true,
      summary: {
        itemCount,
        totalQuantity,
        totalAmount,
      },
      cartItems: processedCartItems,
    };

    console.log(
      `✅ getMyCart - Sending response with ${processedCartItems.length} items`
    );
    return res.status(200).json(responseData);
  } catch (error) {
    console.error("❌ getMyCart - Error fetching cart:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching cart",
      error: error.message,
    });
  }
};

/**
 * Add item to cart
 */
exports.addToCart = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { shopId, seatTypeId, dayId, quantity } = req.body;

    // Validate required fields
    if (!shopId || !seatTypeId || !dayId || !quantity) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than zero",
      });
    }

    // Use user_id directly (customer_id field now links to users.user_id)
    const customerId = req.user.id;

    // Check if seat type is available on the selected day
    const availabilityResults = await query(
      `
      SELECT sta.quantity, sta.price, sta.available
      FROM seat_type_availability sta
      WHERE sta.seat_type_id = ? AND sta.day_id = ?
      `,
      [seatTypeId, dayId]
    );

    if (availabilityResults.length === 0 || !availabilityResults[0].available) {
      return res.status(400).json({
        success: false,
        message: "Seat type is not available on selected day",
      });
    }

    const availability = availabilityResults[0];

    // Check if the requested quantity is available
    // Need to consider existing bookings and existing cart items
    const bookedQuantity = await query(
      `
      SELECT COALESCE(SUM(quantity), 0) as booked_quantity
      FROM bookings
      WHERE seat_type_id = ? AND day_id = ? AND status IN ('pending', 'confirmed')
      `,
      [seatTypeId, dayId]
    );
    const cartQuantity = await query(
      `
      SELECT COALESCE(SUM(quantity), 0) as cart_quantity
      FROM cart_items
      WHERE seat_type_id = ? AND day_id = ? 
        AND customer_id != ?
      `,
      [seatTypeId, dayId, customerId]
    );

    const totalReserved =
      parseInt(bookedQuantity[0].booked_quantity) +
      parseInt(cartQuantity[0].cart_quantity);
    const availableQuantity = availability.quantity - totalReserved;

    if (quantity > availableQuantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableQuantity} seats available`,
        availableQuantity,
      });
    }

    // Calculate total price
    const pricePerSeat = parseFloat(availability.price);
    const totalPrice = pricePerSeat * quantity; // Cart items no longer have expiration time limits
    const expiresAt = null;

    // Check if item already exists in cart
    const existingItem = await query(
      `
      SELECT cart_item_id, quantity
      FROM cart_items      WHERE customer_id = ? AND shop_id = ? AND seat_type_id = ? AND day_id = ?
      `,
      [customerId, shopId, seatTypeId, dayId]
    );

    let cartItemId;

    if (existingItem.length > 0) {
      // Update existing cart item
      const newQuantity = existingItem[0].quantity + quantity;
      const newTotalPrice = pricePerSeat * newQuantity;

      await query(
        `
        UPDATE cart_items
        SET quantity = ?, total_price = ?
        WHERE cart_item_id = ?
        `,
        [newQuantity, newTotalPrice, existingItem[0].cart_item_id]
      );

      cartItemId = existingItem[0].cart_item_id;
    } else {
      // Create new cart item
      const result = await query(
        `
        INSERT INTO cart_items
        (customer_id, shop_id, seat_type_id, day_id, quantity, price_per_seat, total_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          customerId,
          shopId,
          seatTypeId,
          dayId,
          quantity,
          pricePerSeat,
          totalPrice,
        ]
      );

      cartItemId = result.insertId;
    }

    // Get updated cart item
    const [updatedCartItem] = await query(
      `
      SELECT ci.cart_item_id, ci.customer_id, ci.shop_id, ci.seat_type_id, ci.day_id,
             ci.quantity, ci.price_per_seat, ci.total_price, ci.created_at, ci.expires_at,
             s.name as shop_name, s.image1 as shop_image,
             st.name as seat_type_name,
             pd.date as procession_date
      FROM cart_items ci
      JOIN shops s ON ci.shop_id = s.shop_id
      JOIN seat_types st ON ci.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON ci.day_id = pd.day_id
      WHERE ci.cart_item_id = ?
      `,
      [cartItemId]
    ); // Process image URL
    if (updatedCartItem) {
      updatedCartItem.shop_image = updatedCartItem.shop_image
        ? generateImageUrl(req, `uploads/shops/${updatedCartItem.shop_image}`)
        : null;
      updatedCartItem.procession_date = formatDateString(
        updatedCartItem.procession_date
      );
    }

    return res.status(200).json({
      success: true,
      message:
        existingItem.length > 0 ? "Cart item updated" : "Item added to cart",
      cartItem: updatedCartItem,
    });
  } catch (error) {
    console.error("Error adding to cart:", error);
    return res.status(500).json({
      success: false,
      message: "Error adding to cart",
      error: error.message,
    });
  }
};

/**
 * Update cart item quantity
 */
exports.updateCartItem = async (req, res) => {
  try {
    const { cartItemId } = req.params;
    const { quantity } = req.body;

    console.log(
      `📝 updateCartItem - Received request for cart item ${cartItemId} with quantity ${quantity}`
    );
    console.log(
      `👤 updateCartItem - User: ${req.user?.id}, Role: ${req.user?.role}`
    );
    console.log(`🔍 updateCartItem - Request params:`, req.params);
    console.log(`🔍 updateCartItem - Request body:`, req.body);
    console.log(
      `🔍 updateCartItem - cartItemId type: ${typeof cartItemId}, value: "${cartItemId}"`
    );

    if (!req.user) {
      console.log(`❌ updateCartItem - No authenticated user`);
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    // ENHANCED VALIDATION: Check cart item ID format
    if (!cartItemId || cartItemId === "undefined" || cartItemId === "null") {
      console.log(`❌ updateCartItem - Invalid cart item ID: "${cartItemId}"`);
      return res.status(400).json({
        success: false,
        message: "Invalid cart item ID provided",
      });
    }

    // ENHANCED VALIDATION: Ensure cart item ID is a valid positive integer
    const parsedCartItemId = parseInt(cartItemId, 10);
    if (isNaN(parsedCartItemId) || parsedCartItemId <= 0) {
      console.log(
        `❌ updateCartItem - Cart item ID is not a valid positive integer: "${cartItemId}" -> ${parsedCartItemId}`
      );
      return res.status(400).json({
        success: false,
        message: "Cart item ID must be a valid positive number",
      });
    }

    console.log(`✅ updateCartItem - Parsed cart item ID: ${parsedCartItemId}`);

    // Check update permission for cart_items table

    if (!quantity || quantity <= 0) {
      console.log(`❌ updateCartItem - Invalid quantity: ${quantity}`);
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than zero",
      });
    }

    // Use user_id directly (customer_id field now links to users.user_id)
    const customerId = req.user.id;
    console.log(
      `🔍 updateCartItem - Using user ID as customer ID: ${customerId}`
    ); // Check if cart item exists and belongs to the customer
    console.log(
      `🔍 updateCartItem - Looking for cart item: ${parsedCartItemId} (parsed from "${cartItemId}")`
    );
    const cartItemResults = await query(
      `
      SELECT ci.cart_item_id, ci.customer_id, ci.seat_type_id, ci.day_id, 
             ci.price_per_seat, ci.expires_at
      FROM cart_items ci
      WHERE ci.cart_item_id = ?
      `,
      [parsedCartItemId]
    );
    console.log(
      `📊 updateCartItem - Cart item search results: ${cartItemResults.length} found`
    );
    if (cartItemResults.length > 0) {
      console.log(
        `📊 updateCartItem - Found cart item: ${JSON.stringify(
          cartItemResults[0]
        )}`
      );
    }
    if (cartItemResults.length === 0) {
      console.log(
        `❌ updateCartItem - Cart item not found in database: ${parsedCartItemId} (from original "${cartItemId}")`
      );
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }

    const cartItem = cartItemResults[0]; // Verify ownership
    if (cartItem.customer_id !== customerId) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this cart item",
      });
    }

    // Check available quantity
    const availabilityResults = await query(
      `
      SELECT sta.quantity, sta.available
      FROM seat_type_availability sta
      WHERE sta.seat_type_id = ? AND sta.day_id = ?
      `,
      [cartItem.seat_type_id, cartItem.day_id]
    );

    if (availabilityResults.length === 0 || !availabilityResults[0].available) {
      return res.status(400).json({
        success: false,
        message: "Seat type is not available on selected day",
      });
    }

    const availability = availabilityResults[0];

    // Get current user's booking quantity for this seat type and day (same logic as getMyCart line 131)
    const userBookingQuantity = await query(
      `
      SELECT COALESCE(SUM(quantity), 0) as user_booking_quantity
      FROM bookings
      WHERE seat_type_id = ? AND day_id = ? AND customer_id = ? AND status IN ('pending')
      `,
      [cartItem.seat_type_id, cartItem.day_id, customerId]
    );

    // Calculate available quantity using same logic as getMyCart: total capacity + user's bookings
    const userBooked =
      parseInt(userBookingQuantity[0].user_booking_quantity) || 0;
    const availableQuantity = parseInt(availability.quantity) + userBooked;

    console.log(
      `🧮 updateCartItem - Availability calculation (same as getMyCart):`
    );
    console.log(`   Total seat capacity: ${availability.quantity}`);
    console.log(`   User booked quantity: ${userBooked}`);
    console.log(
      `   Available quantity: ${availableQuantity} (capacity + user bookings)`
    );
    console.log(`   Requested quantity: ${quantity}`);

    if (quantity > availableQuantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableQuantity} seats available`,
        availableQuantity,
      });
    } // Calculate new total price
    const totalPrice = cartItem.price_per_seat * quantity;

    // Update cart item
    console.log(
      `📝 updateCartItem - Updating cart item ${parsedCartItemId} with quantity ${quantity}, totalPrice ${totalPrice}`
    );
    await query(
      `
      UPDATE cart_items
      SET quantity = ?, total_price = ?
      WHERE cart_item_id = ?
      `,
      [quantity, totalPrice, parsedCartItemId]
    );

    console.log(
      `✅ updateCartItem - Successfully updated cart item ${parsedCartItemId}`
    );

    // Log activity
    await query(
      "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'cart_item_updated', ?, ?, 'cart_item')",
      [
        req.user.id,
        req.user.role,
        `Updated cart item quantity to ${quantity}`,
        parsedCartItemId,
      ]
    );

    console.log(
      `📝 updateCartItem - Logged activity for cart item ${parsedCartItemId}`
    );

    // Get updated cart item
    console.log(
      `🔍 updateCartItem - Fetching updated cart item ${parsedCartItemId}`
    );
    const [updatedCartItem] = await query(
      `
      SELECT ci.cart_item_id, ci.customer_id, ci.shop_id, ci.seat_type_id, ci.day_id,
             ci.quantity, ci.price_per_seat, ci.total_price, ci.created_at, ci.expires_at,
             s.name as shop_name, s.image1 as shop_image,
             st.name as seat_type_name,
             pd.date as procession_date
      FROM cart_items ci
      JOIN shops s ON ci.shop_id = s.shop_id
      JOIN seat_types st ON ci.seat_type_id = st.seat_type_id
      JOIN procession_days pd ON ci.day_id = pd.day_id      WHERE ci.cart_item_id = ?
      `,
      [parsedCartItemId]
    ); // Process image URL
    if (updatedCartItem) {
      updatedCartItem.shop_image = updatedCartItem.shop_image
        ? generateImageUrl(req, `uploads/shops/${updatedCartItem.shop_image}`)
        : null;
      updatedCartItem.procession_date = formatDateString(
        updatedCartItem.procession_date
      );

      console.log(
        `✅ updateCartItem - Returning updated cart item: ${JSON.stringify({
          cart_item_id: updatedCartItem.cart_item_id,
          quantity: updatedCartItem.quantity,
          total_price: updatedCartItem.total_price,
        })}`
      );
    } else {
      console.log(
        `⚠️ updateCartItem - No updated cart item returned from database`
      );
    }

    return res.status(200).json({
      success: true,
      message: "Cart item updated successfully",
      cartItem: updatedCartItem,
    });
  } catch (error) {
    console.error("❌ updateCartItem - Error updating cart item:", error);
    console.error("❌ updateCartItem - Stack trace:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Error updating cart item",
      error: error.message,
    });
  }
};

/**
 * Remove item from cart
 */
exports.removeFromCart = async (req, res) => {
  try {
    const { cartItemId } = req.params;

    console.log(
      `🗑️ removeFromCart - Received request for cart item ${cartItemId}`
    );
    console.log(
      `👤 removeFromCart - User: ${req.user?.id}, Role: ${req.user?.role}`
    );
    console.log(`🔍 removeFromCart - Request params:`, req.params);
    console.log(
      `🔍 removeFromCart - cartItemId type: ${typeof cartItemId}, value: "${cartItemId}"`
    );

    if (!req.user) {
      console.log(`❌ removeFromCart - No authenticated user`);
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // ENHANCED VALIDATION: Check cart item ID format
    if (!cartItemId || cartItemId === "undefined" || cartItemId === "null") {
      console.log(`❌ removeFromCart - Invalid cart item ID: "${cartItemId}"`);
      return res.status(400).json({
        success: false,
        message: "Invalid cart item ID provided",
      });
    }

    // ENHANCED VALIDATION: Ensure cart item ID is a valid positive integer
    const parsedCartItemId = parseInt(cartItemId, 10);
    if (isNaN(parsedCartItemId) || parsedCartItemId <= 0) {
      console.log(
        `❌ removeFromCart - Cart item ID is not a valid positive integer: "${cartItemId}" -> ${parsedCartItemId}`
      );
      return res.status(400).json({
        success: false,
        message: "Cart item ID must be a valid positive number",
      });
    }

    console.log(`✅ removeFromCart - Parsed cart item ID: ${parsedCartItemId}`);

    // Use user_id directly (customer_id field now links to users.user_id)
    const customerId = req.user.id;
    console.log(
      `🔍 removeFromCart - Using user ID as customer ID: ${customerId}`
    );

    // Check if cart item exists and belongs to the customer
    console.log(
      `🔍 removeFromCart - Looking for cart item: ${parsedCartItemId} (parsed from "${cartItemId}")`
    );
    const cartItemResults = await query(
      "SELECT cart_item_id, customer_id FROM cart_items WHERE cart_item_id = ?",
      [parsedCartItemId]
    );

    console.log(
      `📊 removeFromCart - Cart item search results: ${cartItemResults.length} found`
    );
    if (cartItemResults.length > 0) {
      console.log(
        `📊 removeFromCart - Found cart item: ${JSON.stringify(
          cartItemResults[0]
        )}`
      );
    }

    if (cartItemResults.length === 0) {
      console.log(
        `❌ removeFromCart - Cart item not found in database: ${parsedCartItemId} (from original "${cartItemId}")`
      );
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }
    if (cartItemResults[0].customer_id !== customerId) {
      console.log(
        `❌ removeFromCart - Permission denied: cart item ${parsedCartItemId} belongs to customer ${cartItemResults[0].customer_id}, but requesting customer is ${customerId}`
      );
      return res.status(403).json({
        success: false,
        message: "You don't have permission to remove this cart item",
      });
    }

    console.log(
      `✅ removeFromCart - Permission verified, proceeding to delete cart item ${parsedCartItemId}`
    );

    // Delete the cart item
    await query("DELETE FROM cart_items WHERE cart_item_id = ?", [
      parsedCartItemId,
    ]);
    console.log(
      `✅ removeFromCart - Successfully deleted cart item ${parsedCartItemId}`
    );

    // Log activity
    await query(
      "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'cart_item_removed', ?, ?, 'cart_item')",
      [
        req.user.id,
        req.user.role,
        `Removed item from cart: ${parsedCartItemId}`,
        parsedCartItemId,
      ]
    );

    console.log(
      `📝 removeFromCart - Logged activity for cart item ${parsedCartItemId}`
    );

    return res.status(200).json({
      success: true,
      message: "Item removed from cart successfully",
    });
  } catch (error) {
    console.error("❌ removeFromCart - Error removing cart item:", error);
    return res.status(500).json({
      success: false,
      message: "Error removing cart item",
      error: error.message,
    });
  }
};

/**
 * Clear cart
 */
exports.clearCart = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Use user_id directly (customer_id field now links to users.user_id)
    const customerId = req.user.id;

    // Delete all cart items for the customer
    await query("DELETE FROM cart_items WHERE customer_id = ?", [customerId]);

    // Log activity
    await query(
      "INSERT INTO activity_logs (user_id, role, action_type, description) VALUES (?, ?, 'cart_cleared', ?)",
      [req.user.id, req.user.role, `Cleared shopping cart`]
    );

    return res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Error clearing cart:", error);
    return res.status(500).json({
      success: false,
      message: "Error clearing cart",
      error: error.message,
    });
  }
};

/**
 * Clear cart manually (separate from checkout)
 */
exports.clearCartManually = async (req, res) => {
  try {
    console.log(
      `🛒 clearCartManually - User: ${req.user?.id}, Role: ${req.user?.role}`
    );

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Use user_id directly (customer_id field now links to users.user_id)
    const customerId = req.user.id;
    console.log(`🔍 clearCartManually - Customer ID: ${customerId}`);

    // Delete cart items
    await query("DELETE FROM cart_items WHERE customer_id = ?", [customerId]);

    // Log activity
    await query(
      "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'cart_cleared_manually', ?, ?, 'cart')",
      [req.user.id, req.user.role, `Manually cleared shopping cart`, customerId]
    );

    console.log(
      `✅ clearCartManually - Successfully cleared cart for customer ${customerId}`
    );

    return res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Error clearing cart manually:", error);
    return res.status(500).json({
      success: false,
      message: "Error clearing cart",
      error: error.message,
    });
  }
};

/**
 * Clear cart for a specific customer (internal use, no authentication required)
 * This function is used after successful payment processing
 */
exports.clearCartForCustomer = async (
  customerId,
  logUserId = null,
  logUserRole = "customer"
) => {
  try {
    console.log(
      `🛒 clearCartForCustomer - Clearing cart for customer: ${customerId}`
    );

    // Delete cart items for the specific customer
    const result = await query("DELETE FROM cart_items WHERE customer_id = ?", [
      customerId,
    ]);

    console.log(
      `✅ clearCartForCustomer - Deleted ${result.affectedRows} cart items for customer ${customerId}`
    );

    console.log(
      `✅ clearCartForCustomer - Successfully cleared cart for customer ${customerId}`
    );

    return {
      success: true,
      message: "Cart cleared successfully",
      itemsCleared: result.affectedRows,
    };
  } catch (error) {
    console.error("❌ clearCartForCustomer - Error clearing cart:", error);
    throw new Error(
      `Failed to clear cart for customer ${customerId}: ${error.message}`
    );
  }
};

/**
 * Check availability for all cart items
 */
exports.checkCartAvailability = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Use user_id directly (customer_id field now links to users.user_id)
    const customerId = req.user.id; // Get all cart items for the customer
    const cartItems = await query(
      `
      SELECT ci.cart_item_id, ci.seat_type_id, ci.day_id, ci.quantity
      FROM cart_items ci
      WHERE ci.customer_id = ?
      `,
      [customerId]
    );

    const results = [];
    let allAvailable = true;
    let totalAvailableItems = 0;

    for (const item of cartItems) {
      // Check availability for each item
      const availabilityResults = await query(
        `
        SELECT sta.quantity, sta.available
        FROM seat_type_availability sta
        WHERE sta.seat_type_id = ? AND sta.day_id = ?
        `,
        [item.seat_type_id, item.day_id]
      );

      if (
        availabilityResults.length === 0 ||
        !availabilityResults[0].available
      ) {
        results.push({
          cartItemId: item.cart_item_id,
          isAvailable: false,
          availableQuantity: 0,
          requestedQuantity: item.quantity,
          message: "Seat type is not available on selected day",
        });
        allAvailable = false;
        continue;
      }

      const availability = availabilityResults[0];

      // Check existing bookings and other cart items
      const bookedQuantity = await query(
        `
        SELECT COALESCE(SUM(quantity), 0) as booked_quantity
        FROM bookings
        WHERE seat_type_id = ? AND day_id = ? AND status IN ('pending', 'confirmed')
        `,
        [item.seat_type_id, item.day_id]
      );
      const cartQuantity = await query(
        `
        SELECT COALESCE(SUM(quantity), 0) as cart_quantity
        FROM cart_items
        WHERE seat_type_id = ? AND day_id = ? 
          AND customer_id != ?
        `,
        [item.seat_type_id, item.day_id, customerId]
      );

      const totalReserved =
        parseInt(bookedQuantity[0].booked_quantity) +
        parseInt(cartQuantity[0].cart_quantity);
      const availableQuantity = availability.quantity - totalReserved;

      const isAvailable = item.quantity <= availableQuantity;

      results.push({
        cartItemId: item.cart_item_id,
        isAvailable,
        availableQuantity,
        requestedQuantity: item.quantity,
        message: isAvailable
          ? "Available"
          : `Only ${availableQuantity} seats available`,
      });

      if (isAvailable) {
        totalAvailableItems++;
      } else {
        allAvailable = false;
      }
    }

    return res.status(200).json({
      success: true,
      results,
      allAvailable,
      totalAvailableItems,
    });
  } catch (error) {
    console.error("Error checking cart availability:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking cart availability",
      error: error.message,
    });
  }
};

/**
 * Validate cart quantities
 */
exports.validateCartQuantities = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { cartItems } = req.body;

    if (!cartItems || !Array.isArray(cartItems)) {
      return res.status(400).json({
        success: false,
        message: "Cart items array is required",
      });
    }

    // Use user_id directly (customer_id field now links to users.user_id)
    const customerId = req.user.id;
    const results = [];

    for (const item of cartItems) {
      // Check availability for each item
      const availabilityResults = await query(
        `
        SELECT sta.quantity, sta.available
        FROM seat_type_availability sta
        WHERE sta.seat_type_id = ? AND sta.day_id = ?
        `,
        [item.seatTypeId, item.dayId]
      );

      if (
        availabilityResults.length === 0 ||
        !availabilityResults[0].available
      ) {
        results.push({
          cartItemId: item.cartItemId,
          isAvailable: false,
          availableQuantity: 0,
          requestedQuantity: item.quantity,
          message: "Seat type is not available on selected day",
        });
        continue;
      }

      const availability = availabilityResults[0];

      // Check existing bookings and other cart items
      const bookedQuantity = await query(
        `
        SELECT COALESCE(SUM(quantity), 0) as booked_quantity
        FROM bookings
        WHERE seat_type_id = ? AND day_id = ? AND status IN ('pending', 'confirmed')
        `,
        [item.seatTypeId, item.dayId]
      );
      const cartQuantity = await query(
        `
        SELECT COALESCE(SUM(quantity), 0) as cart_quantity
        FROM cart_items
        WHERE seat_type_id = ? AND day_id = ? 
          AND customer_id != ?
        `,
        [item.seatTypeId, item.dayId, customerId]
      );

      const totalReserved =
        parseInt(bookedQuantity[0].booked_quantity) +
        parseInt(cartQuantity[0].cart_quantity);
      const availableQuantity = availability.quantity - totalReserved;

      const isAvailable = item.quantity <= availableQuantity;

      results.push({
        cartItemId: item.cartItemId,
        isAvailable,
        availableQuantity,
        requestedQuantity: item.quantity,
        message: isAvailable
          ? "Available"
          : `Only ${availableQuantity} seats available`,
      });
    }

    return res.status(200).json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Error validating cart quantities:", error);
    return res.status(500).json({
      success: false,
      message: "Error validating cart quantities",
      error: error.message,
    });
  }
};

/**
 * Adjust cart quantities
 */
exports.adjustCartQuantities = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { adjustments } = req.body;

    if (!adjustments || !Array.isArray(adjustments)) {
      return res.status(400).json({
        success: false,
        message: "Adjustments array is required",
      });
    }

    // Use user_id directly (customer_id field now links to users.user_id)
    const customerId = req.user.id;

    for (const adjustment of adjustments) {
      const { cartItemId, newQuantity } = adjustment;

      if (newQuantity <= 0) {
        // Remove item if quantity is 0 or less
        await query(
          "DELETE FROM cart_items WHERE cart_item_id = ? AND customer_id = ?",
          [cartItemId, customerId]
        );
      } else {
        // Get cart item details for price calculation
        const cartItemResults = await query(
          "SELECT price_per_seat FROM cart_items WHERE cart_item_id = ? AND customer_id = ?",
          [cartItemId, customerId]
        );
        if (cartItemResults.length > 0) {
          const pricePerSeat = cartItemResults[0].price_per_seat;
          const totalPrice = pricePerSeat * newQuantity;

          // Update cart item
          await query(
            `
            UPDATE cart_items
            SET quantity = ?, total_price = ?
            WHERE cart_item_id = ? AND customer_id = ?
            `,
            [newQuantity, totalPrice, cartItemId, customerId]
          );
        }
      }

      // Log activity
      await query(
        "INSERT INTO activity_logs (user_id, role, action_type, description, affected_entity_id, entity_type) VALUES (?, ?, 'cart_quantity_adjusted', ?, ?, 'cart_item')",
        [
          req.user.id,
          req.user.role,
          `Adjusted cart item quantity to ${newQuantity}: ${
            adjustment.reason || "Stock adjustment"
          }`,
          cartItemId,
        ]
      );
    }

    // Return updated cart
    const updatedCart = await this.getMyCart(req, res);
    return updatedCart;
  } catch (error) {
    console.error("Error adjusting cart quantities:", error);
    return res.status(500).json({
      success: false,
      message: "Error adjusting cart quantities",
      error: error.message,
    });
  }
};

/**
 * Get available quantity for a specific seat type and day
 */
exports.getAvailableQuantity = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { seatTypeId, dayId } = req.query;

    if (!seatTypeId || !dayId) {
      return res.status(400).json({
        success: false,
        message: "seatTypeId and dayId are required",
      });
    }

    // Check availability
    const availabilityResults = await query(
      `
      SELECT sta.quantity, sta.available
      FROM seat_type_availability sta
      WHERE sta.seat_type_id = ? AND sta.day_id = ?
      `,
      [seatTypeId, dayId]
    );

    if (availabilityResults.length === 0 || !availabilityResults[0].available) {
      return res.status(200).json({
        success: true,
        availableQuantity: 0,
        message: "Seat type is not available on selected day",
      });
    }

    const availability = availabilityResults[0];

    // Check existing bookings and cart items
    const bookedQuantity = await query(
      `
      SELECT COALESCE(SUM(quantity), 0) as booked_quantity
      FROM bookings
      WHERE seat_type_id = ? AND day_id = ? AND status IN ('pending', 'confirmed')
      `,
      [seatTypeId, dayId]
    );
    const cartQuantity = await query(
      `
      SELECT COALESCE(SUM(quantity), 0) as cart_quantity
      FROM cart_items
      WHERE seat_type_id = ? AND day_id = ?
      `,
      [seatTypeId, dayId]
    );

    const totalReserved =
      parseInt(bookedQuantity[0].booked_quantity) +
      parseInt(cartQuantity[0].cart_quantity);
    const availableQuantity = Math.max(
      0,
      availability.quantity - totalReserved
    );

    return res.status(200).json({
      success: true,
      availableQuantity,
      totalQuantity: availability.quantity,
      reservedQuantity: totalReserved,
    });
  } catch (error) {
    console.error("Error getting available quantity:", error);
    return res.status(500).json({
      success: false,
      message: "Error getting available quantity",
      error: error.message,
    });
  }
};

/**
 * Checkout - Create bookings from cart items
 */
exports.checkout = async (req, res) => {
  try {
    console.log(`🛒 checkout - User: ${req.user?.id}, Role: ${req.user?.role}`);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Use user_id directly (customer_id field now links to users.user_id)
    const customerId = req.user.id;
    console.log(`🔍 checkout - Customer ID: ${customerId}`); // Get all cart items for the customer
    const cartItems = await query(
      `
      SELECT ci.cart_item_id, ci.shop_id, ci.seat_type_id, ci.day_id,
             ci.quantity, ci.price_per_seat, ci.total_price, ci.expires_at
      FROM cart_items ci
      WHERE ci.customer_id = ?
      ORDER BY ci.created_at DESC
      `,
      [customerId]
    );

    if (cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items in cart to checkout",
      });
    }
    console.log(
      `📦 checkout - Found ${cartItems.length} cart items to checkout`
    );

    // Begin transaction
    await query("START TRANSACTION");

    try {
      const createdBookings = [];
      const insufficientItems = []; // Track items with insufficient availability

      // First pass: Check if any deductions would result in negative availability
      for (const item of cartItems) {
        // Get current seat type availability
        const availabilityResults = await query(
          `
          SELECT sta.quantity, sta.available, st.name as seat_type_name
          FROM seat_type_availability sta
          JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
          WHERE sta.seat_type_id = ? AND sta.day_id = ?
          `,
          [item.seat_type_id, item.day_id]
        );

        if (
          availabilityResults.length === 0 ||
          !availabilityResults[0].available
        ) {
          insufficientItems.push({
            seatTypeName:
              availabilityResults[0]?.seat_type_name || "Unknown Seat Type",
            requestedQuantity: item.quantity,
            availableQuantity: 0,
            message: "Seat type is not available on selected day",
          });
          continue;
        }

        const availability = availabilityResults[0];

        // Check if booking already exists
        const existingBooking = await query(
          `
          SELECT booking_id, quantity, total_price 
          FROM bookings 
          WHERE customer_id = ? AND shop_id = ? AND seat_type_id = ? AND day_id = ? AND status = 'pending'
          `,
          [customerId, item.shop_id, item.seat_type_id, item.day_id]
        );

        let quantityToDeduct = 0;

        if (existingBooking.length > 0) {
          // Calculate difference for existing booking
          const previousQuantity = existingBooking[0].quantity;
          quantityToDeduct = item.quantity - previousQuantity;
        } else {
          // Full quantity for new booking
          quantityToDeduct = item.quantity;
        }

        // Check if deduction would result in negative availability
        const newAvailability = availability.quantity - quantityToDeduct;
        if (newAvailability < 0) {
          insufficientItems.push({
            seatTypeName: availability.seat_type_name,
            requestedQuantity: quantityToDeduct,
            availableQuantity: availability.quantity,
            message: `Only ${availability.quantity} seats available`,
          });
        }
      }

      // If any items have insufficient availability, rollback and return error
      if (insufficientItems.length > 0) {
        await query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Insufficient seat availability for some items",
          insufficientItems: insufficientItems,
        });
      }

      // Second pass: Process bookings and update availability (all validations passed)
      for (const item of cartItems) {
        // First, check if a booking already exists with same customer_id, shop_id, seat_type_id, day_id, and status 'pending'
        const existingBooking = await query(
          `
          SELECT booking_id, quantity, total_price 
          FROM bookings 
          WHERE customer_id = ? AND shop_id = ? AND seat_type_id = ? AND day_id = ? AND status = 'pending'
          `,
          [customerId, item.shop_id, item.seat_type_id, item.day_id]
        );

        let bookingId;
        if (existingBooking.length > 0) {
          // Update existing booking
          bookingId = existingBooking[0].booking_id;
          const previousQuantity = existingBooking[0].quantity;

          await query(
            `
            UPDATE bookings 
            SET quantity = ?, total_price = ?, updated_at = CURRENT_TIMESTAMP, expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE)
            WHERE booking_id = ?
            `,
            [item.quantity, item.total_price, bookingId]
          );

          console.log(
            `📝 Updated existing booking ${bookingId} for customer ${customerId}`
          );

          // Deduct the difference from seat_type_availability
          const quantityDifference = item.quantity - previousQuantity;
          if (quantityDifference > 0) {
            // Only deduct if the new quantity is greater than the previous quantity
            await query(
              `
              UPDATE seat_type_availability 
              SET quantity = quantity - ?
              WHERE seat_type_id = ? AND day_id = ?
              `,
              [quantityDifference, item.seat_type_id, item.day_id]
            );

            console.log(
              `📉 Deducted ${quantityDifference} seats from availability for seat_type_id: ${item.seat_type_id}, day_id: ${item.day_id}`
            );
          } else if (quantityDifference < 0) {
            // Add back seats if the new quantity is less than the previous quantity
            await query(
              `
              UPDATE seat_type_availability 
              SET quantity = quantity + ?
              WHERE seat_type_id = ? AND day_id = ?
              `,
              [Math.abs(quantityDifference), item.seat_type_id, item.day_id]
            );

            console.log(
              `📈 Added back ${Math.abs(
                quantityDifference
              )} seats to availability for seat_type_id: ${
                item.seat_type_id
              }, day_id: ${item.day_id}`
            );
          }
        } else {
          // Create new booking record with pending status and expires_at set to 15 minutes from now
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

          bookingId = bookingResult.insertId;
          console.log(
            `✅ Created new booking ${bookingId} for customer ${customerId}`
          );

          // Deduct the full quantity from seat_type_availability for new bookings
          await query(
            `
            UPDATE seat_type_availability 
            SET quantity = quantity - ?
            WHERE seat_type_id = ? AND day_id = ?
            `,
            [item.quantity, item.seat_type_id, item.day_id]
          );

          console.log(
            `📉 Deducted ${item.quantity} seats from availability for seat_type_id: ${item.seat_type_id}, day_id: ${item.day_id}`
          );
        } // Log activity - determine if it was an update or creation

        // Get booking details
        const [bookingDetails] = await query(
          `
          SELECT b.booking_id, b.customer_id, b.shop_id, b.seat_type_id, 
                 b.day_id, b.quantity, b.total_price, b.status, b.created_at, b.expires_at,
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

        createdBookings.push({
          ...bookingDetails,
          procession_date: formatDateString(bookingDetails.procession_date),
        });
      } // Mark cart items as processed (don't delete them)
      // Instead, we could add a processed flag or just leave them for user reference
      // For now, we'll leave the cart items intact as requested

      // Commit transaction
      await query("COMMIT");
      console.log(
        `✅ checkout - Successfully processed ${createdBookings.length} bookings (created or updated)`
      );

      return res.status(201).json({
        success: true,
        message: `Successfully processed ${createdBookings.length} booking(s) from cart`,
        bookings: createdBookings,
        totalAmount: cartItems.reduce(
          (sum, item) => sum + parseFloat(item.total_price),
          0
        ),
      });
    } catch (dbError) {
      // Rollback transaction
      await query("ROLLBACK");
      throw dbError;
    }
  } catch (error) {
    console.error("Error during checkout:", error);
    return res.status(500).json({
      success: false,
      message: "Error during checkout",
      error: error.message,
    });
  }
};
