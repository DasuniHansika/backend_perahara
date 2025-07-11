
const { query } = require('../../config/database-schema');

const dashboardController = {
  getDashboardSummary: async (req, res) => {
    try {
      // Total procession days
      const [daysCount] = await query("SELECT COUNT(*) as count FROM procession_days");
      
      // Total shops
      const [shopsCount] = await query("SELECT COUNT(*) as count FROM shops");
      
      // Total seat types
      const [seatTypesCount] = await query("SELECT COUNT(*) as count FROM seat_types");
      
      // Total customers
      const [customersCount] = await query("SELECT COUNT(*) as count FROM customers");
      
      // Total sellers
      const [sellersCount] = await query("SELECT COUNT(*) as count FROM sellers");
      
      // Total bookings by status
      const bookingsByStatus = await query(`
        SELECT status, COUNT(*) as count 
        FROM bookings 
        GROUP BY status
      `);
      
      // Total revenue from confirmed bookings
      const [revenue] = await query(`
        SELECT COALESCE(SUM(p.amount), 0) as total_revenue
        FROM payments p
        JOIN bookings b ON p.booking_id = b.booking_id
        WHERE p.status = 'success' AND b.status = 'confirmed'
      `);
      
      res.json({
        success: true,
        data: {
          totalDays: daysCount.count,
          totalShops: shopsCount.count,
          totalSeatTypes: seatTypesCount.count,
          totalCustomers: customersCount.count,
          totalSellers: sellersCount.count,
          bookingsByStatus,
          totalRevenue: revenue.total_revenue || 0
        }
      });
    } catch (error) {
      console.error("Error getting dashboard summary:", error);
      res.status(500).json({ success: false, message: "Failed to get dashboard summary" });
    }
  },

  // getDayByDayReport: async (req, res) => {
  //   try {
  //     const days = await query(`
  //       SELECT pd.day_id, pd.date, pd.event_name, pd.description
  //       FROM procession_days pd
  //       ORDER BY pd.date ASC
  //     `);
      
  //     const dayReports = [];
      
  //     for (const day of days) {
  //       const shops = await query(`
  //         SELECT 
  //           s.shop_id, s.name as shop_name, s.street, s.latitude, s.longitude,
  //           sl.seller_id, sl.first_name as seller_first_name, sl.last_name as seller_last_name,
  //           st.seat_type_id, st.name as seat_type_name, st.description as seat_type_desc,
  //           sta.availability_id, sta.price, sta.quantity as total_seats,
  //           COALESCE((
  //             SELECT SUM(b.quantity) 
  //             FROM bookings b 
  //             WHERE b.seat_type_id = st.seat_type_id 
  //             AND b.day_id = pd.day_id 
  //             AND b.status = 'confirmed'
  //           ), 0) as booked_seats
  //         FROM procession_days pd
  //         JOIN seat_type_availability sta ON pd.day_id = sta.day_id
  //         JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
  //         JOIN shops s ON st.shop_id = s.shop_id
  //         JOIN sellers sl ON s.seller_id = sl.seller_id
  //         WHERE pd.day_id = ?
  //         ORDER BY s.name, st.name
  //       `, [day.day_id]);
        
  //       const bookings = await query(`
  //         SELECT 
  //           b.booking_id, b.quantity, b.total_price, b.status, b.created_at,
  //           c.customer_id, c.first_name as customer_first_name, c.last_name as customer_last_name,
  //           u.email as customer_email,
  //           p.payment_id, p.amount, p.payment_method, p.status as payment_status,
  //           p.payhere_order_id, p.payhere_payment_id
  //         FROM bookings b
  //         JOIN customers c ON b.customer_id = c.customer_id
  //         JOIN users u ON c.user_id = u.user_id
  //         LEFT JOIN payments p ON b.booking_id = p.booking_id
  //         WHERE b.day_id = ?
  //         ORDER BY b.created_at DESC
  //       `, [day.day_id]);
        
  //       const dayRevenue = await query(`
  //         SELECT COALESCE(SUM(p.amount), 0) as total_revenue
  //         FROM payments p
  //         JOIN bookings b ON p.booking_id = b.booking_id
  //         WHERE b.day_id = ? AND p.status = 'success' AND b.status = 'confirmed'
  //       `, [day.day_id]);
        
  //       // Calculate seat totals
  //       const seatTotals = shops.reduce((acc, shop) => {
  //         acc.totalSeats += shop.total_seats;
  //         acc.bookedSeats += shop.booked_seats;
  //         acc.availableSeats += (shop.total_seats - shop.booked_seats);
  //         return acc;
  //       }, { totalSeats: 0, bookedSeats: 0, availableSeats: 0 });
        
  //       dayReports.push({
  //         day_id: day.day_id,
  //         date: day.date,
  //         event_name: day.event_name,
  //         description: day.description,
  //         total_shops: shops.length,
  //         total_seat_types: [...new Set(shops.map(s => s.seat_type_id))].length,
  //         total_seats: seatTotals.totalSeats,
  //         booked_seats: seatTotals.bookedSeats,
  //         available_seats: seatTotals.availableSeats,
  //         total_revenue: dayRevenue[0].total_revenue || 0,
  //         shops,
  //         bookings
  //       });
  //     }
      
  //     res.json({
  //       success: true,
  //       data: dayReports
  //     });
  //   } catch (error) {
  //     console.error("Error getting day-by-day report:", error);
  //     res.status(500).json({ success: false, message: "Failed to get day-by-day report" });
  //   }
  // },


  getDayByDayReport: async (req, res) => {
    try {
      const days = await query(`
        SELECT pd.day_id, pd.date, pd.event_name, pd.description, pd.color
        FROM procession_days pd
        ORDER BY pd.date ASC
      `);
      
      const dayReports = [];
      
      for (const day of days) {
        // Get shops and seat availability for this day
        const shops = await query(`
          SELECT 
            s.shop_id, s.name as shop_name, s.street, s.latitude, s.longitude,
            sl.seller_id, sl.first_name as seller_first_name, sl.last_name as seller_last_name,
            st.seat_type_id, st.name as seat_type_name, st.description as seat_type_desc,
            sta.availability_id, sta.price, sta.quantity as total_seats,
            COALESCE((
              SELECT SUM(b.quantity) 
              FROM bookings b 
              WHERE b.seat_type_id = st.seat_type_id 
              AND b.day_id = pd.day_id 
              AND b.status = 'confirmed'
            ), 0) as booked_seats
          FROM procession_days pd
          JOIN seat_type_availability sta ON pd.day_id = sta.day_id
          JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
          JOIN shops s ON st.shop_id = s.shop_id
          JOIN sellers sl ON s.seller_id = sl.seller_id
          WHERE pd.day_id = ?
          ORDER BY s.name, st.name
        `, [day.day_id]);
        
        // Get bookings for this day
        const bookings = await query(`
          SELECT 
            b.booking_id, b.quantity, b.total_price, b.status, b.created_at,
            c.customer_id, c.first_name as customer_first_name, c.last_name as customer_last_name,
            u.email as customer_email,
            p.payment_id, p.amount, p.payment_method, p.status as payment_status,
            p.payhere_order_id, p.payhere_payment_id
          FROM bookings b
          JOIN customers c ON b.customer_id = c.customer_id
          JOIN users u ON c.user_id = u.user_id
          LEFT JOIN payments p ON b.booking_id = p.booking_id
          WHERE b.day_id = ?
          ORDER BY b.created_at DESC
        `, [day.day_id]);
        
        // Get total revenue for this day
        const dayRevenue = await query(`
          SELECT COALESCE(SUM(p.amount), 0) as total_revenue
          FROM payments p
          JOIN bookings b ON p.booking_id = b.booking_id
          WHERE b.day_id = ? AND p.status = 'success' AND b.status = 'confirmed'
        `, [day.day_id]);
        
        // Get procession routes for this day
        const routes = await query(`
          SELECT route_id, latitude, longitude, sequence
          FROM procession_routes
          WHERE day_id = ?
          ORDER BY sequence ASC
        `, [day.day_id]);
        
        // Calculate seat totals
        const seatTotals = shops.reduce((acc, shop) => {
          acc.totalSeats += shop.total_seats;
          acc.bookedSeats += shop.booked_seats;
          acc.availableSeats += (shop.total_seats - shop.booked_seats);
          return acc;
        }, { totalSeats: 0, bookedSeats: 0, availableSeats: 0 });
        
        dayReports.push({
          day_id: day.day_id,
          date: day.date,
          event_name: day.event_name,
          description: day.description,
          color: day.color,
          total_shops: shops.length,
          total_seat_types: [...new Set(shops.map(s => s.seat_type_id))].length,
          total_seats: seatTotals.totalSeats,
          booked_seats: seatTotals.bookedSeats,
          available_seats: seatTotals.availableSeats,
          total_revenue: dayRevenue[0].total_revenue || 0,
          routes, // Include the route details
          shops,
          bookings
        });
      }
      
      res.json({
        success: true,
        data: dayReports
      });
    } catch (error) {
      console.error("Error getting day-by-day report:", error);
      res.status(500).json({ success: false, message: "Failed to get day-by-day report" });
    }
  },
  getSellerPerformance: async (req, res) => {
    try {
      const sellers = await query(`
        SELECT 
          s.seller_id, 
          s.first_name, 
          s.last_name, 
          s.nic, 
          s.bank_account_number,
          s.bank_name, 
          s.branch_name,
          u.email,
          u.mobile_number as phone,
          COUNT(sh.shop_id) as shop_count,
          (
            SELECT COUNT(*) 
            FROM customers c
            JOIN users u ON c.user_id = u.user_id
            WHERE u.created_by IN (
              SELECT user_id FROM sellers WHERE seller_id = s.seller_id
            )
          ) as customer_count
        FROM sellers s
        LEFT JOIN shops sh ON s.seller_id = sh.seller_id
        JOIN users u ON s.user_id = u.user_id
        GROUP BY s.seller_id
      `);
      
      const sellerReports = [];
      
      for (const seller of sellers) {
        const seatTypes = await query(`
          SELECT COUNT(*) as count
          FROM seat_types st
          JOIN shops sh ON st.shop_id = sh.shop_id
          WHERE sh.seller_id = ?
        `, [seller.seller_id]);
        
        const seats = await query(`
          SELECT 
            COALESCE(SUM(sta.quantity), 0) as total_seats,
            COALESCE((
              SELECT SUM(b.quantity)
              FROM bookings b
              JOIN seat_types st ON b.seat_type_id = st.seat_type_id
              JOIN shops sh ON st.shop_id = sh.shop_id
              WHERE sh.seller_id = ? AND b.status = 'confirmed'
            ), 0) as booked_seats
          FROM seat_type_availability sta
          JOIN seat_types st ON sta.seat_type_id = st.seat_type_id
          JOIN shops sh ON st.shop_id = sh.shop_id
          WHERE sh.seller_id = ?
        `, [seller.seller_id, seller.seller_id]);
        
        const revenue = await query(`
          SELECT COALESCE(SUM(p.amount), 0) as total_revenue
          FROM payments p
          JOIN bookings b ON p.booking_id = b.booking_id
          JOIN seat_types st ON b.seat_type_id = st.seat_type_id
          JOIN shops sh ON st.shop_id = sh.shop_id
          WHERE sh.seller_id = ? AND p.status = 'success' AND b.status = 'confirmed'
        `, [seller.seller_id]);
        
        const topShops = await query(`
          SELECT 
            sh.name as shop_name,
            sh.street,
            COALESCE(SUM(p.amount), 0) as revenue
          FROM shops sh
          LEFT JOIN seat_types st ON sh.shop_id = st.shop_id
          LEFT JOIN bookings b ON st.seat_type_id = b.seat_type_id
          LEFT JOIN payments p ON b.booking_id = p.booking_id
          WHERE sh.seller_id = ? AND p.status = 'success' AND b.status = 'confirmed'
          GROUP BY sh.shop_id
          ORDER BY revenue DESC
          LIMIT 3
        `, [seller.seller_id]);
        
        sellerReports.push({
          seller_id: seller.seller_id,
          first_name: seller.first_name,
          last_name: seller.last_name,
          nic: seller.nic,
          bank_account_number: seller.bank_account_number,
          bank_name: seller.bank_name,
          branch_name: seller.branch_name,
          email: seller.email,
          phone: seller.phone,
          shop_count: seller.shop_count,
          customer_count: seller.customer_count,
          seat_type_count: seatTypes[0].count,
          total_seats: seats[0].total_seats,
          booked_seats: seats[0].booked_seats,
          available_seats: seats[0].total_seats - seats[0].booked_seats,
          total_revenue: revenue[0].total_revenue || 0,
          top_shops: topShops
        });
      }
      
      res.json({
        success: true,
        data: sellerReports
      });
    } catch (error) {
      console.error("Error getting seller performance:", error);
      res.status(500).json({ success: false, message: "Failed to get seller performance" });
    }
  }
};

module.exports = dashboardController;