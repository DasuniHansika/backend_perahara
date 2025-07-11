require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { initializeFirebaseAdmin } = require("./config/firebase");
const { query, pool } = require("./config/database-schema");
const { initializeAuthSync } = require("./config/firebaseAuthSync");

const app = express();


if (initializeFirebaseAdmin()) {

  setTimeout(() => {
    initializeAuthSync();
  }, 30000); 
} else {
  console.error(
    "WARNING: Firebase initialization failed. Authentication features may not work correctly."
  );
}


// Basic middleware
const corsOptions = {
  origin: [
    

     "http://localhost:3001",
     "http://localhost:3002",
  
    /.*\.payhere\.lk$/, // Allow PayHere domains
    /.*\.sandbox\.payhere\.lk$/, // Allow PayHere sandbox domains
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Allow-Origin",
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Methods",
  ],
  exposedHeaders: ["Content-Length", "X-Foo", "X-Bar"],
};

app.use(cors(corsOptions));

// Add additional headers for cross-origin issues
app.use((req, res, next) => {
  // Handle Cross-Origin-Opener-Policy for Firebase Auth
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");

  // Additional security headers for dev tunnel
  if (req.get("host")?.includes("devtunnels.ms")) {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Content-Type-Options", "nosniff");
  }

  next();
});

// Configure body parser with increased limits for image uploads
app.use(
  bodyParser.json({
    limit: "50mb", // Increase limit to 50MB for base64 images
    parameterLimit: 100000,
    extended: true,
  })
);
app.use(
  bodyParser.urlencoded({
    limit: "50mb",
    parameterLimit: 100000,
    extended: true,
  })
);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Request logging middleware for debugging
app.use((req, res, next) => {
  console.log(
    `🔍 [Request] ${req.method} ${req.path} - IP: ${
      req.ip
    } - ${new Date().toISOString()}`
  );
  next();
});

// Health check endpoints
app.get("/", (req, res) => {
  res.status(200).json({
    status: "API is running",
    message: "Perahera Gallery API",
  });
});

app.get("/api/health", (req, res) => {
  console.log(
    `🏥 [Health] Health check requested from ${
      req.ip
    } at ${new Date().toISOString()}`
  );
  res.status(200).json({
    status: "healthy",
    message: "Perahera Gallery API is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Route definitions
const routes = [
  { path: "/api/users", file: "./routes/usersRoutes" },
  { path: "/api/admin", file: "./routes/adminRoutes" },
  { path: "/api/firebase", file: "./routes/firebaseAuthRoutes" },
  { path: "/api/profile", file: "./routes/userProfileRoutes" },
  { path: "/api/booking", file: "./routes/bookingRoutes" },
  { path: "/api/payments", file: "./routes/paymentsRoutes" },
  { path: "/api/checkout-customers", file: "./routes/checkoutCustomerRoutes" },
  { path: "/api/customer-tickets", file: "./routes/customerTicketsRoutes" },
  { path: "/api/tickets", file: "./routes/ticketVerification" },
  { path: "/api/email-verification", file: "./routes/emailVerificationRoutes" },
  { path: "/api/shops", file: "./routes/shopsRoutes" },
  { path: "/api/sellers", file: "./routes/sellersRoutes" },
  { path: "/api/procession/days", file: "./routes/processionDayRoutes" },
  { path: "/api/procession/routes", file: "./routes/processionRouteRoutes" },
  { path: "/api/cart", file: "./routes/cartRoutes" },
  { path: "/api/activity-logs", file: "./routes/activityLogRoutes" },
  { path: "/api/seat-types", file: "./routes/seatTypeRoutes" },
  { path: "/api/map", file: "./routes/mapProxyRoutes" },
  { path: "/api/home", file: "./routes/homeRoutes" },






  { path: "/api/admin/users", file: "./routes/admin/usersRoutes" },
  { path: "/api/admin/admin", file: "./routes/admin/adminRoutes" },
  { path: "/api/admin/firebase", file: "./routes/admin/firebaseAuthRoutes" },
  { path: "/api/admin/profile", file: "./routes/admin/userProfileRoutes" },
  { path: "/api/admin/booking", file: "./routes/admin/bookingRoutes" },
  { path: "/api/admin/payments", file: "./routes/admin/paymentsRoutes" },
  { path: "/api/admin/email-verification", file: "./routes/admin/emailVerificationRoutes" },
  { path: "/api/admin/shops", file: "./routes/admin/shopsRoutes" },
  { path: "/api/admin/sellers", file: "./routes/admin/sellersRoutes" },
  { path: "/api/admin/procession/days", file: "./routes/admin/processionDayRoutes" },
   { path: "/api/admin/procession/routes", file: "./routes/admin/processionRouteRoutes" },
  { path: "/api/admin/cart", file: "./routes/admin/cartRoutes" },
  { path: "/api/admin/activity-logs", file: "./routes/admin/activityLogRoutes" },
  { path: "/api/admin/seat-types", file: "./routes/admin/seatTypeRoutes" },
  { path: "/api/admin/seat-type-availability", file: "./routes/admin/seatTypeAvailabilityRoutes" },
  { path: "/api/admin/customers", file: "./routes/admin/customerRoutes" },
   { path: "/api/admin/dashboard", file: "./routes/admin/dashboardRoutes" },
];

// Load all routes with enhanced error handling
routes.forEach((route) => {
  try {
    const router = require(route.file);
    app.use(route.path, router);
    console.log(`✅ Route ${route.path} loaded successfully`);
  } catch (err) {
    console.error(`❌ Error loading route ${route.path}:`, err.message);
    console.error("Stack trace:", err.stack);
    // Continue loading other routes even if one fails
  }
});

// 404 handler - must be after all other routes
app.use((req, res) => {
  console.log(`🔍 [404] Route not found: ${req.method} ${req.path}`);
  if (!res.headersSent) {
    res.status(404).json({
      success: false,
      error: "Not Found",
      message: `Route ${req.method} ${req.path} not found`,
    });
  }
});

// Error handling middleware for specific errors
app.use((err, req, res, next) => {
  // Handle headers already sent error - just log it, don't try to respond
  if (err.code === "ERR_HTTP_HEADERS_SENT") {
    console.error(
      "⚠️ [HeadersError] Headers already sent - response already completed:",
      err.message
    );
    return; // Don't try to send another response
  }

  // Only send error responses if headers haven't been sent yet
  if (res.headersSent) {
    console.error(
      "⚠️ [ResponseError] Error occurred after response was sent:",
      err.message
    );
    return;
  }

  // Handle payload too large errors
  if (err.type === "entity.too.large" || err.code === "LIMIT_FILE_SIZE") {
    console.error("📊 [PayloadError] Request payload too large:", err.message);
    return res.status(413).json({
      success: false,
      error: "Payload Too Large",
      message:
        "The uploaded image is too large. Please use a smaller image (max 50MB).",
      details: err.message,
    });
  }

  // Handle JSON parsing errors
  if (err.type === "entity.parse.failed") {
    console.error("📊 [ParseError] JSON parsing failed:", err.message);
    return res.status(400).json({
      success: false,
      error: "Invalid JSON",
      message: "Invalid JSON format in request body.",
      details: err.message,
    });
  }

  // Generic error handling
  console.error("❌ [ServerError]", err.stack);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: err.message || "Something went wrong!",
  });
});

module.exports = app;
