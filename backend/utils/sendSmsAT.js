const africastalking = require('africastalking');
require('dotenv').config();

const AT = africastalking({
  apiKey: process.env.AFRICASTALKING_APIKEY,
  username: process.env.AFRICASTALKING_USERNAME
});

const sendSmsAT = async (to, message) => {
  try {
    const response = await AT.SMS.send({
      to: [to],
      message,
      from: process.env.AFRICASTALKING_SENDERID || undefined
    });
    return response;
  } catch (error) {
    throw new Error('SMS send failed: ' + error.message);
  }
};

module.exports = { sendSmsAT };
