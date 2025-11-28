const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { auth, authorizeRoles } = require('../middlewares/authMiddleware');
const paynow = require('../utils/paynow'); // Import Paynow utility
const { body, validationResult } = require('express-validator');



router.get('/', (req, res) => {
  res.json({ message: 'Payment routes are working' });
});

// POST a new payment request
// Automatically calculates amount from linked services
router.post('/', auth, async (req, res) => {
  const { appointmentId, method } = req.body;

  // ✅ Validate method
  if (!['online', 'medical_aid', 'physical'].includes(method)) {
    return res.status(400).json({ message: 'Invalid payment method' });
  }

  try {
    // ✅ Confirm appointment ownership
    const appt = await pool.query(
      'SELECT * FROM appointments WHERE id = $1 AND patient_id = $2',
      [appointmentId, req.user.id]
    );
    if (appt.rows.length === 0) {
      return res.status(403).json({ message: 'Unauthorized or invalid appointment' });
    }

    // ✅ Prevent duplicate pending requests
    const existing = await pool.query(
      'SELECT * FROM payments WHERE appointment_id = $1 AND status = $2',
      [appointmentId, 'pending']
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'A pending payment request already exists for this appointment' });
    }

    // ✅ Fetch all services for this appointment
    const servicesResult = await pool.query(
      `SELECT s.price FROM services s
       JOIN appointment_services aps ON s.id = aps.service_id
       WHERE aps.appointment_id = $1`,
      [appointmentId]
    );

    if (servicesResult.rows.length === 0) {
      return res.status(400).json({ message: 'No services found for this appointment' });
    }

    // ✅ Calculate total
    const totalAmount = servicesResult.rows.reduce((sum, s) => sum + parseFloat(s.price), 0);

    // ✅ Insert payment
    const result = await pool.query(
      `INSERT INTO payments (appointment_id, user_id, method, amount, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [appointmentId, req.user.id, method, totalAmount]
    );

    res.status(201).json({ message: 'Payment request submitted', payment: result.rows[0] });

  } catch (err) {
    console.error('Error creating payment:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



// INITIATE ONLINE PAYMENT
router.post('/paynow/initiate', 
  auth,
  [
    body('appointmentId').isInt().withMessage('Invalid appointment ID'),
    body('amount').isFloat({ min: 5, max: 500 }).withMessage('Amount must be between $5 and $500') // Adjust as needed
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { appointmentId, amount } = req.body;

    try {
      const appt = await pool.query(
        'SELECT * FROM appointments WHERE id = $1 AND patient_id = $2',
        [appointmentId, req.user.id]
      );
      if (appt.rows.length === 0) {
        return res.status(403).json({ message: 'Unauthorized or invalid appointment' });
      }

      // Create Paynow payment
      const payment = paynow.createPayment(req.user.username, req.user.email);
      payment.add(`Appointment #${appointmentId}`, amount);

      const response = await paynow.send(payment);

      if (response.success) {
        await pool.query(
          `INSERT INTO payments (appointment_id, service_id, user_id, method, amount, status, transaction_id)
           VALUES ($1, $2, $3, 'online', $4, 'pending', $5)`,
          [appointmentId, null, req.user.id, amount, response.pollUrl]
        );

        res.json({ redirectUrl: response.redirectUrl });
      } else {
        res.status(400).json({ message: 'Failed to initiate Paynow payment' });
      }

    } catch (err) {
      console.error('Paynow error:', err);
      res.status(500).json({ message: 'Server error' });
    }
});



// GET payment status
router.post('/status', async (req, res) => {
  const { reference, status } = req.body;

  try {
    // Update the payment status
    await pool.query(
      `UPDATE payments SET status = $1, updated_at = NOW() WHERE transaction_id = $2`,
      [status.toLowerCase(), reference]
    );

    res.sendStatus(200);
  } catch (err) {
    console.error('Error updating payment status:', err);
    res.sendStatus(500);
  }
});


// Veiw payment requests (for Doctors, Dentist, Nurse and Admins)
router.get('/requests', auth, authorizeRoles('doctor', 'dentist', 'nurse', 'admin'), async (req, res) => {
  try {
    let query = `
      SELECT p.*, a.date, a.time, u.username 
      FROM payments p 
      JOIN appointments a ON p.appointment_id = a.id 
      JOIN users u ON p.user_id = u.id 
    `;
    let values = [];

    // Only admins can see all payments
    if (req.user.role !== 'admin') {
      query += ' WHERE a.staff_id = $1'; // Assuming staff_id is in appointments
      values.push(req.user.id);
    }

    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching payment requests:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// SUBMIT physical or medical aid payment
router.post('/submit', auth, async (req, res) => {
  const { appointmentId, serviceId, method } = req.body;

  if (!['physical', 'medical_aid'].includes(method)) {
    return res.status(400).json({ message: 'Invalid payment method' });
  }

  try {
    // Get service details
    const service = await pool.query(`SELECT * FROM services WHERE id = $1`, [serviceId]);
    if (service.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Check appointment ownership
    const appt = await pool.query(
      `SELECT * FROM appointments WHERE id = $1 AND patient_id = $2`,
      [appointmentId, req.user.id]
    );
    if (appt.rows.length === 0) {
      return res.status(403).json({ message: 'Unauthorized appointment' });
    }

    // Save payment
    const result = await pool.query(
      `INSERT INTO payments (appointment_id, user_id, service_id, amount, method, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [appointmentId, req.user.id, serviceId, service.rows[0].price, method]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error submitting payment:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ADMIN marks offline payment as paid
router.put('/mark-paid/:id', auth, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE payments SET status = 'paid', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating payment status:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Patient's payment history
router.get('/my/history', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, s.name AS service_name
       FROM payments p
       JOIN services s ON p.service_id = s.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching payment history:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;


