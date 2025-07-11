// routes/sellersRoutes.js
const express = require("express");
const router = express.Router();
const sellersController = require("../controllers/sellerController");

router.post("/", sellersController.createSeller);
router.get("/", sellersController.getAllSellers);
router.get("/:id", sellersController.getSellerById);
router.put("/:id", sellersController.updateSeller);
router.delete("/:id", sellersController.deleteSeller);
router.post("/login", sellersController.loginSeller);

module.exports = router; // Make sure this export exists
