const cron = require('node-cron');
const  pool  = require('../db/database');
const { sendSmsAT } = require('../utils/sendSmsAT');
const { sendReportEmail } = require('../utils/sendMail');
const { createExcelReport } = require('../utils/exportReport');

// Helper to send SMS and log
async function sendAndLogSMS(to, message, type) {
  try {
    const response = await sendSmsAT(to, message);
    await pool.query(
      `INSERT INTO sms_logs (recipient, message, status, type) VALUES ($1, $2, $3, $4)`,
      [to, message, response.SMSMessageData?.Message || 'SENT', type]
    );
  } catch (err) {
    await pool.query(
      `INSERT INTO sms_logs (recipient, message, status, type) VALUES ($1, $2, $3, $4)`,
      [to, message, 'FAILED: ' + err.message, type]
    );
  }
}

// Send reports to all eligible users
async function sendReports(type, intervalText) {
  try {
    // 1. Query analytics data from appointments
    const result = await pool.query(`
      SELECT COUNT(*) AS total, procedure_type
      FROM appointments
      WHERE created_at > NOW() - INTERVAL '${intervalText}'
      GROUP BY procedure_type
    `);

    const summary = result.rows.map(r => `${r.procedure_type}: ${r.total}`).join('\n');
    const message = `📊 ${type.charAt(0).toUpperCase() + type.slice(1)} Clinic Report:\n\n${summary}`;

    // 2. Query recipients from users table
    const usersRes = await pool.query(`
      SELECT username, email, phone, notify_method
      FROM users
      WHERE role IN ('admin', 'doctor', 'dentist')
    `);

    const recipients = usersRes.rows.map(user => ({
      method: user.notify_method,
      to: user.notify_method === 'sms' ? user.phone : user.email
    }));

    // 3. Send report to each user
    for (const user of recipients) {
      if (user.method === 'sms') {
        await sendAndLogSMS(user.to, message, type);
      } else {
        const filePath = await createExcelReport(result.rows); // Generates Excel file
        await sendReportEmail(user.to, `${type.toUpperCase()} Report`, `See attached ${type} report`, filePath);
      }
    }
  } catch (err) {
    console.error(`Error sending ${type} report:`, err);
  }
}

// ⏰ Weekly: Every Sunday 08:00
cron.schedule('0 8 * * 0', () => {
  sendReports('weekly', '7 days');
});

// 📅 Monthly: 1st of each month at 08:00
cron.schedule('0 8 1 * *', () => {
  sendReports('monthly', '30 days');
});

// 🗓️ Yearly: January 1st at 08:00
cron.schedule('0 8 1 1 *', () => {
  sendReports('yearly', '1 year');
});
