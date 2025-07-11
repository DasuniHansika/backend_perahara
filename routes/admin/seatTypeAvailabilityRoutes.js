const express = require('express');
const router = express.Router();
const seatTypeAvailabilityController = require('../../controllers/admin/seatTypeAvailabilityController');
const {
  verifyFirebaseToken,
  requireUser,
  requireRole
} = require('../../middleware/firebase_Auth');

// Get all procession days (updated route path)
router.get('/procession-days', seatTypeAvailabilityController.getProcessionDays);

// Other existing routes...
router.get('/:seatTypeId/day/:dayId', seatTypeAvailabilityController.getSeatTypeAvailability);
router.get('/:seatTypeId', seatTypeAvailabilityController.getAllAvailabilityForSeatType);
router.post(
  '/:seatTypeId',
  verifyFirebaseToken,
  requireUser,
  requireRole(['admin', 'super_admin', 'seller']),
  seatTypeAvailabilityController.createSeatTypeAvailability
);
router.put(
  '/:seatTypeId/day/:dayId',
  verifyFirebaseToken,
  requireUser,
  requireRole(['admin', 'super_admin', 'seller']),
  seatTypeAvailabilityController.updateSeatTypeAvailability
);
router.delete(
  '/:availabilityId',
  verifyFirebaseToken,
  requireUser,
  requireRole(['admin', 'super_admin', 'seller']),
  seatTypeAvailabilityController.deleteSeatTypeAvailability
);

module.exports = router;