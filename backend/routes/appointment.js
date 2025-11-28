const { auth, authorizeRoles } = require('../middlewares/authMiddleware'); // Import auth middleware
const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Import the database connection pool    

// CREATE appointment with service
router.post('/', async (req, res) => {
  try {
    const {
      patient_name,
      patient_contact,
      appointment_date,
      appointment_time,
      doctor_type,
      reason,
      service_id  
    } = req.body;

    if (!service_id) {
      return res.status(400).json({ message: 'Service is required' });
    }

    const result = await pool.query(
      `INSERT INTO appointments 
       (patient_name, patient_contact, appointment_date, appointment_time, doctor_type, reason, service_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [patient_name, patient_contact, appointment_date, appointment_time, doctor_type, reason, service_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating appointment:', err);
    res.status(500).send('Server error');
  }
});

// CREATE appointment (authenticated patient)
router.post('/book', auth, async (req, res) => {
  const { appointment_date, appointment_time, staff_id, service_id, reason } = req.body;

  if (!staff_id || !service_id) {
    return res.status(400).json({ message: 'Staff and service are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO appointments 
       (patient_id, staff_id, service_id, appointment_date, appointment_time, reason) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, staff_id, service_id, appointment_date, appointment_time, reason]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating appointment:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// Get all appointments for a patient with service details
router.get('/my', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, s.name AS service_name, s.role AS service_type
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.patient_id = $1
       ORDER BY a.date DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// RESCHEDULE / FULL UPDATE appointment
router.put('/:id', auth, async (req, res) => {
  const appointmentId = req.params.id;
  const {
    patient_name,
    patient_contact,
    appointment_date,
    appointment_time,
    doctor_type,
    reason,
    status,
    staff_id,
    service_id
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE appointments 
       SET patient_name = $1, 
           patient_contact = $2, 
           appointment_date = $3, 
           appointment_time = $4, 
           doctor_type = $5, 
           reason = $6, 
           status = $7,
           staff_id = $8,
           service_id = $9
       WHERE id = $10 RETURNING *`,
      [
        patient_name,
        patient_contact,
        appointment_date,
        appointment_time,
        doctor_type,
        reason,
        status,
        staff_id,
        service_id,
        appointmentId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Appointment not found');
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating appointment:', err);
    res.status(500).send('Server error');
  }
});


// PARTIAL UPDATE appointment
router.patch('/:id', auth, async (req, res) => {
  const appointmentId = req.params.id;
  const updates = req.body;

  try {
    const fields = Object.keys(updates);
    const values = Object.values(updates);

    if (fields.length === 0) {
      return res.status(400).send('No fields to update');
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const query = `UPDATE appointments SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`;

    const result = await pool.query(query, [...values, appointmentId]);

    if (result.rows.length === 0) {
      return res.status(404).send('Appointment not found');
    }

    res.json({ message: 'Appointment updated successfully', appointment: result.rows[0] });
  } catch (err) {
    console.error('Error updating appointment:', err);
    res.status(500).send('Server error');
  }
});


// SOFT DELETE appointment (mark as cancelled)
router.patch('/:id/cancel', auth, authorizeRoles('admin','doctor','dentist','nurse'), async (req, res) => {
    try {
        const appointmentId = req.params.id;

        const result = await pool.query(
            `UPDATE appointments SET status = 'cancelled' WHERE id = $1 RETURNING *`,
            [appointmentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send('Appointment not found');
        }

        res.json({ message: 'Appointment cancelled successfully', appointment: result.rows[0] });
    } catch (err) {
        console.error('Error cancelling appointment:', err);
        res.status(500).send('Server error');
    }
});

// HARD DELETE appointment (permanently delete)
router.delete('/:id', auth, authorizeRoles('admin'), async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const result = await pool.query('DELETE FROM appointments WHERE id = $1 RETURNING *', [appointmentId]);

        if (result.rows.length === 0) {
            return res.status(404).send('Appointment not found');
        }

        res.json({ message: 'Appointment permanently deleted', appointment: result.rows[0] });
    } catch (err) {
        console.error('Error deleting appointment:', err);
        res.status(500).send('Server error');
    }
});
module.exports = router;