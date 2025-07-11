// Advanced rate limiting middleware for production traffic management
const rateLimit = require("express-rate-limit");
const { rateLimit: redisClient } = require("../services/cacheService");

/**
 * Redis store for rate limiting (distributed rate limiting across multiple servers)
 */
class RedisStore {
  constructor(options = {}) {
    this.client = options.client || redisClient;
    this.prefix = options.prefix || "rl:";
    this.resetExpiryOnChange = options.resetExpiryOnChange || false;
  }

  async increment(key) {
    const redisKey = this.prefix + key;

    try {
      const multi = this.client.multi();
      multi.incr(redisKey);
      multi.expire(redisKey, this.windowMs / 1000);

      const results = await multi.exec();
      const totalHits = results[0][1];

      return {
        totalHits,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    } catch (error) {
      console.error("Rate limit Redis error:", error);
      // Fallback to allow request if Redis fails
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key) {
    const redisKey = this.prefix + key;
    try {
      await this.client.decr(redisKey);
    } catch (error) {
      console.error("Rate limit decrement error:", error);
    }
  }

  async resetKey(key) {
    const redisKey = this.prefix + key;
    try {
      await this.client.del(redisKey);
    } catch (error) {
      console.error("Rate limit reset error:", error);
    }
  }
}

/**
 * Custom key generator for more sophisticated rate limiting
 */
const generateKey = (req, type = "api") => {
  const ip = req.ip || req.connection.remoteAddress;
  const userId = req.user?.id || "anonymous";
  const userAgent = req.get("User-Agent") || "unknown";

  // Create a hash of user agent to detect bot behavior
  const userAgentHash = require("crypto")
    .createHash("md5")
    .update(userAgent)
    .digest("hex")
    .substring(0, 8);

  return `${type}:${ip}:${userId}:${userAgentHash}`;
};

/**
 * Advanced rate limiting configurations
 */

// General API rate limiting
const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: "rl:api:",
  }),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // requests per window

  keyGenerator: (req) => generateKey(req, "api"),

  message: {
    success: false,
    error: "Rate limit exceeded",
    message: "Too many requests from this IP, please try again later.",
    retryAfter: "15 minutes",
  },

  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers

  // Custom handler for rate limit exceeded
  handler: (req, res) => {
    console.warn(
      `🚫 [RATE_LIMIT] API limit exceeded for ${req.ip} - ${generateKey(
        req,
        "api"
      )}`
    );
    res.status(429).json({
      success: false,
      error: "Rate limit exceeded",
      message: "Too many requests. Please slow down and try again later.",
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },

  // Skip successful requests from counting toward limit
  skip: (req, res) => res.statusCode < 400,

  // Skip rate limiting for certain conditions
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

// Authentication endpoint rate limiting (more restrictive)
const authLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: "rl:auth:",
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 100, // Much lower limit for auth

  keyGenerator: (req) => generateKey(req, "auth"),

  message: {
    success: false,
    error: "Authentication rate limit exceeded",
    message: "Too many authentication attempts. Please try again later.",
    retryAfter: "15 minutes",
  },

  handler: (req, res) => {
    console.warn(
      `🚫 [RATE_LIMIT] Auth limit exceeded for ${req.ip} - ${generateKey(
        req,
        "auth"
      )}`
    );
    res.status(429).json({
      success: false,
      error: "Authentication rate limit exceeded",
      message:
        "Too many authentication attempts. Please try again in 15 minutes.",
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },

  standardHeaders: true,
  legacyHeaders: false,
});

// Payment endpoint rate limiting (very restrictive)
const paymentLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: "rl:payment:",
  }),
  windowMs: 60 * 60 * 1000, // 1 hour window for payments
  max: parseInt(process.env.PAYMENT_RATE_LIMIT_MAX) || 50, // Very low limit

  keyGenerator: (req) => {
    // For payments, use user ID if authenticated, otherwise IP
    const userId = req.user?.id;
    const ip = req.ip || req.connection.remoteAddress;
    return userId ? `payment:user:${userId}` : `payment:ip:${ip}`;
  },

  message: {
    success: false,
    error: "Payment rate limit exceeded",
    message:
      "Too many payment attempts. Please contact support if you need assistance.",
    retryAfter: "1 hour",
  },

  handler: (req, res) => {
    const identifier = req.user?.id || req.ip;
    console.error(`🚫 [RATE_LIMIT] Payment limit exceeded for ${identifier}`);
    res.status(429).json({
      success: false,
      error: "Payment rate limit exceeded",
      message: "Too many payment attempts detected. Please contact support.",
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },

  standardHeaders: true,
  legacyHeaders: false,
});

// File upload rate limiting
const uploadLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: "rl:upload:",
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // 200 uploads per hour

  keyGenerator: (req) => generateKey(req, "upload"),

  message: {
    success: false,
    error: "Upload rate limit exceeded",
    message: "Too many file uploads. Please try again later.",
    retryAfter: "1 hour",
  },

  handler: (req, res) => {
    console.warn(`🚫 [RATE_LIMIT] Upload limit exceeded for ${req.ip}`);
    res.status(429).json({
      success: false,
      error: "Upload rate limit exceeded",
      message:
        "Too many file uploads. Please wait before uploading more files.",
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },

  // Only count failed uploads and large uploads
  skip: (req, res) => {
    // Skip if successful and small file
    return res.statusCode < 400 && req.get("content-length") < 1024 * 1024; // 1MB
  },
});

// Admin endpoint rate limiting (moderate restrictions)
const adminLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: "rl:admin:",
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 minutes for admin operations

  keyGenerator: (req) => {
    // Use user ID for admin requests
    const userId = req.user?.id || "anonymous";
    return `admin:${userId}`;
  },

  message: {
    success: false,
    error: "Admin rate limit exceeded",
    message: "Too many admin operations. Please slow down.",
    retryAfter: "15 minutes",
  },

  // Skip for super_admin role
  skip: (req) => req.user?.role === "super_admin",
});

// Health check rate limiting (very permissive)
const healthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 health checks per minute

  keyGenerator: (req) => req.ip,

  message: {
    success: false,
    error: "Health check rate limit exceeded",
    message: "Too many health check requests.",
  },

  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * DDoS Protection - Extreme rate limiting for suspicious behavior
 */
const ddosProtection = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: "rl:ddos:",
  }),
  windowMs: 60 * 1000, // 1 minute window
  max: 100, // 100 requests per minute (very strict)

  keyGenerator: (req) => req.ip,

  message: {
    success: false,
    error: "Access temporarily restricted",
    message: "Suspicious activity detected. Access temporarily restricted.",
  },

  handler: (req, res) => {
    console.error(`🚨 [DDOS_PROTECTION] Potential attack from ${req.ip}`);
    res.status(429).json({
      success: false,
      error: "Access restricted",
      message: "Too many requests detected. Access temporarily restricted.",
    });
  },

  // Only apply to suspicious patterns
  skip: (req) => {
    // Skip for authenticated users with good behavior
    return req.user && req.user.role !== "customer";
  },
});

/**
 * Middleware to detect and handle suspicious behavior
 */
const suspiciousBehaviorDetector = (req, res, next) => {
  const userAgent = req.get("User-Agent") || "";
  const ip = req.ip;

  // Common bot patterns
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /php/i,
  ];

  // Suspicious user agents
  const isSuspicious =
    botPatterns.some((pattern) => pattern.test(userAgent)) ||
    userAgent.length < 10 ||
    userAgent === "";

  if (isSuspicious) {
    console.warn(
      `🤖 [SUSPICIOUS] Potential bot detected: ${ip} - ${userAgent}`
    );

    // Apply stricter rate limiting for bots
    const botLimiter = rateLimit({
      store: new RedisStore({
        client: redisClient,
        prefix: "rl:bot:",
      }),
      windowMs: 60 * 1000, // 1 minute
      max: 10, // Very strict for bots
      keyGenerator: () => `bot:${ip}`,
      message: {
        success: false,
        error: "Bot traffic detected",
        message: "Automated traffic is restricted.",
      },
    });

    return botLimiter(req, res, next);
  }

  next();
};

/**
 * Rate limit status endpoint for monitoring
 */
const getRateLimitStatus = async (req, res) => {
  try {
    const ip = req.ip;
    const userId = req.user?.id;

    const keys = [
      `api:${ip}`,
      `auth:${ip}`,
      `payment:${userId ? `user:${userId}` : `ip:${ip}`}`,
      `upload:${ip}`,
      `admin:${userId || "anonymous"}`,
    ];

    const status = {};

    for (const key of keys) {
      try {
        const count = (await redisClient.get(`rl:${key}`)) || 0;
        const ttl = await redisClient.ttl(`rl:${key}`);
        status[key] = {
          count: parseInt(count),
          resetIn: ttl > 0 ? ttl : 0,
        };
      } catch (error) {
        status[key] = { error: error.message };
      }
    }

    res.json({
      success: true,
      rateLimitStatus: status,
      ip: ip,
      userId: userId,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get rate limit status",
      message: error.message,
    });
  }
};

module.exports = {
  apiLimiter,
  authLimiter,
  paymentLimiter,
  uploadLimiter,
  adminLimiter,
  healthLimiter,
  ddosProtection,
  suspiciousBehaviorDetector,
  getRateLimitStatus,
  RedisStore,
};
