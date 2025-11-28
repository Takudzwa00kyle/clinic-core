const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,      // your Gmail
    pass: process.env.EMAIL_PASS_APP   // app password, not normal password
  }
});

const sendReportEmail = async (to, subject, text, filePath) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    attachments: [
      {
        filename: filePath.split('/').pop(),
        path: filePath
      }
    ]
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendReportEmail };
