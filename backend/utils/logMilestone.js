const pool = require('../db/database');
const { sendReportEmail } = require('./sendMail'); // Import email utility
const { sendSmsAT } = require('./sendSmsAT'); // Import SMS utility

const logMilestone = async (type, value) => {
  try {
    // 🧠 Prevent duplicates (log each milestone only once)
    const check = await pool.query(
      `SELECT * FROM milestone_logs WHERE type = $1 AND value = $2`,
      [type, value]
    );
    if (check.rows.length > 0) return; // Already logged

    // 🎯 Insert new milestone
    await pool.query(
      `INSERT INTO milestone_logs (type, value) VALUES ($1, $2)`,
      [type, value]
    );

    // 🎉 Notify staff (SMS + Email)
    const message = `🎯 Milestone reached: ${value} ${type}!\nCheck your dashboard for updates.`;
    const subject = `Milestone Unlocked: ${value} ${type}`;
    const emailBody = `<h3>${value} ${type} milestone reached</h3><p>🎉 Great job team!</p>`;

    // You can store real staff emails/numbers or fetch from DB
    const notifyEmails = ['clinicadmin@gmail.com'];
    const notifyPhones = ['+26377XXXXXXX'];

    // Send notifications
    notifyEmails.forEach(email => sendReportEmail(email, subject, emailBody));
    notifyPhones.forEach(phone => sendSmsAT(phone, message));

    console.log(`Milestone ${type} ${value} logged & staff notified`);
  } catch (err) {
    console.error('Error logging milestone:', err);
  }
};

module.exports = { logMilestone };
