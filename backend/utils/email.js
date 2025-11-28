const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    server: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Your Gmail address
        pass: process.env.EMAIL_PASS // Password or App Password for Gmail
    }
});

module.exports = transporter;