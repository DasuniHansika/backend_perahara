// Proxy route for OpenStreetMap tiles and PayHere images to handle CORS issues
const express = require("express");
const https = require("https");
const router = express.Router();

// Proxy endpoint for Map tiles
router.get("/tiles/:z/:x/:y.png", (req, res) => {
  const { z, x, y } = req.params;

  // Validate tile coordinates
  if (!z || !x || !y || isNaN(z) || isNaN(x) || isNaN(y)) {
    return res.status(400).json({ error: "Invalid tile coordinates" });
  }

  // Use CartoDB Positron tiles which are more permissive for development
  //   const tileUrl = `https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/${z}/${x}/${y}.png`;
  const tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

  // Create HTTPS request to CartoDB
  const requestOptions = {
    headers: {
      "User-Agent":
        "PeraheraGallery/1.0 (https://perahera-gallery.com; contact@perahera-gallery.com)",
      Referer: "https://perahera-gallery.com",
    },
  };

  let responseSent = false;

  const request = https.get(tileUrl, requestOptions, (tileResponse) => {
    if (responseSent) return;

    if (tileResponse.statusCode === 200) {
      // Forward the image data
      tileResponse.pipe(res);
      responseSent = true;
    } else {
      responseSent = true;
      res.status(tileResponse.statusCode || 500).json({
        error: "Failed to fetch tile",
        status: tileResponse.statusCode,
      });
    }
  });

  request.on("error", (error) => {
    if (responseSent) return;
    console.error("Map Proxy Error:", error);
    responseSent = true;
    res.status(500).json({ error: "Failed to fetch tile" });
  });

  request.setTimeout(10000, () => {
    if (responseSent) return;
    request.destroy();
    responseSent = true;
    res.status(504).json({ error: "Tile request timeout" });
  });
});

// Proxy endpoint for PayHere images
router.get("/payhere/:imageName", (req, res) => {
  const { imageName } = req.params;

  // Validate image name to prevent path traversal
  if (!imageName || imageName.includes("..") || imageName.includes("/")) {
    return res.status(400).json({ error: "Invalid image name" });
  }

  const imageUrl = `https://www.payhere.lk/downloads/images/${imageName}`;

  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

  let responseSent = false;

  // Create HTTPS request to PayHere
  const request = https.get(imageUrl, (imageResponse) => {
    if (responseSent) return;

    if (imageResponse.statusCode === 200) {
      // Forward the image data
      imageResponse.pipe(res);
      responseSent = true;
    } else {
      responseSent = true;
      res.status(imageResponse.statusCode || 500).json({
        error: "Failed to fetch PayHere image",
        status: imageResponse.statusCode,
      });
    }
  });

  request.on("error", (error) => {
    if (responseSent) return;
    console.error("Error fetching PayHere image:", error);
    responseSent = true;
    res.status(500).json({ error: "Failed to fetch PayHere image" });
  });

  request.setTimeout(10000, () => {
    if (responseSent) return;
    request.destroy();
    responseSent = true;
    res.status(504).json({ error: "PayHere image request timeout" });
  });
});

module.exports = router;
