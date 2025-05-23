const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const bulkRequestHandler = require('../middleware/bulkRequestMiddleware');
const verifyRole = require('../middleware/verifyRole');
const upload = require('../config/gridFsStorage');
const { cacheMiddleware } = require('../config/redis');

router.get('/', verifyRole(['admin']), customerController.getAllCustomers);
router.post('/', verifyRole(['admin']), bulkRequestHandler(customerController.createCustomer));
router.get('/search', verifyRole(['admin']), customerController.searchCustomers);
router.get('/:customer_id', verifyRole(['admin', 'customer']), cacheMiddleware(60), customerController.getCustomerById);
router.patch('/:customer_id', verifyRole(['admin', 'customer']), customerController.updateCustomer);
//router.delete('/:customer_id', verifyRole(['admin']), customerController.deleteCustomer);
router.delete('/delete/:customer_id', verifyRole(['admin', 'customer']), customerController.deleteCustomerProfile);
router.patch('/:customer_id/location', verifyRole(['customer']), customerController.updateCustomerLocation);
router.get('/:customer_id/reviews', verifyRole(['admin', 'driver', 'customer']), cacheMiddleware(120), customerController.getCustomerReviews);
router.post('/:customer_id/rides/:ride_id/images', verifyRole(['customer']), upload.array('images', 5), customerController.uploadRideImages);
router.post('/:customer_id/media', verifyRole(['admin', 'customer']), upload.single('file'), customerController.uploadCustomerMedia);


module.exports = router;