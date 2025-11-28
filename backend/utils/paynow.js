const Paynow = require('paynow');
require('dotenv').config();

const paynow = new Paynow(
  process.env.PAYNOW_INTEGRATION_ID,
  process.env.PAYNOW_INTEGRATION_KEY
);

paynow.resultUrl = 'http://localhost:5000/api/payments/status'; // callback
paynow.returnUrl = 'http://localhost:3000/payment-success'; // frontend

module.exports = paynow;
// This module initializes the Paynow SDK with the integration ID and key