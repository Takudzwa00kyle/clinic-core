const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { auth } = require('../middlewares/authMiddleware'); // Import authentication middleware
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');

router.get('/', (req, res) => {
  res.json({ message: 'Patient routes are working' });
});


// GET all patients
router.get('/patients', auth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, username, email, phone, suburb, city, created_at FROM users WHERE role = 'patient'`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching patients:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET a single patient by ID
router.get('/patients/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`SELECT id, username, email, phone, suburb, city, created_at FROM users WHERE id = $1 AND role = 'patient'`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching patient:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Register a new patient
router.post('/patients', 
  auth,
  [
    body('username').isLength({ min: 3 }).withMessage('Username required (min 3 characters)'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password required (min 6 chars)')
  ],
  async (req, res) => {
    const allowedRoles = ['admin', 'doctor', 'dentist', 'nurse'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, phone, suburb, city } = req.body;

    try {
      // Check if username or email exists
      const check = await pool.query(`SELECT * FROM users WHERE username = $1 OR email = $2`, [username, email]);
      if (check.rows.length > 0) {
        return res.status(400).json({ message: 'Username or email already in use' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert new patient
      const result = await pool.query(
        `INSERT INTO users (username, email, password, phone, suburb, city, role, confirmed) 
         VALUES ($1, $2, $3, $4, $5, $6, 'patient', true) RETURNING id, username, email`,
        [username, email, hashedPassword, phone || '', suburb || '', city || '']
      );

      res.status(201).json({ message: 'Patient registered', user: result.rows[0] });
    } catch (err) {
      console.error('Error registering patient:', err);
      res.status(500).json({ message: 'Server error' });
    }
});

// UPDATE patient details by ID
router.put('/patients/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { username, email, phone, suburb, city } = req.body;

  try {
    // Check if patient exists
    const check = await pool.query(`SELECT * FROM users WHERE id = $1 AND role = 'patient'`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Update patient details
    const result = await pool.query(
      `UPDATE users SET username = $1, email = $2, phone = $3, suburb = $4, city = $5 
       WHERE id = $6 RETURNING id, username, email`,
      [username, email, phone || '', suburb || '', city || '', id]
    );

    res.json({ message: 'Patient updated', user: result.rows[0] });
  } catch (err) {
    console.error('Error updating patient:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE a patient by ID
router.delete('/patients/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    // Check if patient exists
    const check = await pool.query(`SELECT * FROM users WHERE id = $1 AND role = 'patient'`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Patient not found, or already deleted' });
    }

    // Delete patient
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);

    res.json({ message: 'Patient deleted' });
  } catch (err) {
    console.error('Error deleting patient:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search/filter patients
router.get('/patients/search', auth, async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ message: 'Search query is required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, username, email, phone, suburb, city, created_at 
       FROM users 
       WHERE role = 'patient' AND (username ILIKE $1 OR email ILIKE $1)`,
      [`%${query}%`]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error searching patients:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;