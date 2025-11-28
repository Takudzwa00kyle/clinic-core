const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth, authorizeRoles } = require('../middlewares/authMiddleware');

// CREATE a new service
router.post('/', auth, authorizeRoles('admin'), async (req, res) => {
  const { name, description, price, role } = req.body;

  if (!name || !price || !role) {
    return res.status(400).json({ message: 'Name, price, and role are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO services (name, description, price, role)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description || null, price, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating service:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all services
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY role, name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// UPDATE a service
router.put('/:id', auth, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { name, description, price, role } = req.body;

  try {
    const result = await pool.query(
      `UPDATE services SET name = $1, description = $2, price = $3, role = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, description || null, price, role, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating service:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE a service
router.delete('/:id', auth, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM services WHERE id = $1', [id]);
    res.json({ message: 'Service deleted successfully' });
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
