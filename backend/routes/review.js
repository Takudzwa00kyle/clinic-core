const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth, authorizeRoles } = require('../middlewares/authMiddleware');

router.get('/', (req, res) => {
  res.json({ message: 'Review routes are working' });
});

// POST a new review
router.post('/', auth, async (req, res) => {
  const { appointmentId, rating, comment } = req.body;

  if (!appointmentId || !rating) {
    return res.status(400).json({ message: 'Appointment ID and rating are required' });
  }

  try {
    // 1. Check if the appointment exists and belongs to the user
    const apptCheck = await pool.query(
      'SELECT * FROM appointments WHERE id = $1 AND patient_id = $2',
      [appointmentId, req.user.id]
    );
    if (apptCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Invalid appointment or unauthorized access' });
    }

    // 2. Check if the user has already submitted a review before
    const reviewCheck = await pool.query(
      'SELECT * FROM reviews WHERE user_id = $1',
      [req.user.id]
    );
    if (reviewCheck.rows.length > 0) {
      return res.status(400).json({ message: 'You have already submitted a review' });
    }

    // 3. Insert the review
    const result = await pool.query(
      `INSERT INTO reviews (appointment_id, user_id, rating, comment, updated_at) 
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [appointmentId, req.user.id, rating, comment || null]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error('Error creating review:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all reviews (public by default)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.appointment_id, r.user_id, r.rating, r.comment, r.updated_at, 
                    u.username 
             FROM reviews r 
             JOIN users u ON r.user_id = u.id 
             ORDER BY r.updated_at DESC`
        );
        
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching reviews:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET reviews by appointment ID
router.get('/appointment/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await pool.query(
        `SELECT r.id, r.appointment_id, r.user_id, r.rating, r.comment, r.updated_at, 
                u.username 
         FROM reviews r 
         JOIN users u ON r.user_id = u.id 
         WHERE r.appointment_id = $1 
         ORDER BY r.updated_at DESC`,
        [id]
        );
    
        if (result.rows.length === 0) {
        return res.status(404).json({ message: 'No reviews found for this appointment' });
        }
    
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching reviews by appointment ID:', err);
        res.status(500).json({ message: 'Server error' });
    }
    });

// Update (existing) review with 14-day limit and admin override
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  if (!rating) {
    return res.status(400).json({ message: 'Rating is required' });
  }

  try {
    // Fetch review
    const reviewCheck = await pool.query(
      'SELECT * FROM reviews WHERE id = $1',
      [id]
    );

    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const review = reviewCheck.rows[0];

    // Allow update if:
    // - The user owns it AND it's within 14 days
    // - OR the user is an admin
    const isOwner = review.user_id === req.user.id;
    const isAdmin = req.user.role === 'admin';
    const reviewCreatedAt = new Date(review.created_at);
    const now = new Date();
    const fourteenDaysInMs = 14 * 24 * 60 * 60 * 1000;

    const isWithin14Days = now - reviewCreatedAt <= fourteenDaysInMs;

    if (!(isAdmin || (isOwner && isWithin14Days))) {
      return res.status(403).json({
        message: isOwner
          ? 'You can only update your review within 14 days'
          : 'Unauthorized to update this review'
      });
    }

    // Update the review
    const result = await pool.query(
      `UPDATE reviews SET rating = $1, comment = $2, updated_at = NOW() 
       WHERE id = $3 RETURNING *`,
      [rating, comment || null, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating review:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE a review (admin only)
router.delete('/:id', auth, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    const reviewCheck = await pool.query('SELECT * FROM reviews WHERE id = $1', [id]);

    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Review not found' });
    }

    await pool.query('DELETE FROM reviews WHERE id = $1', [id]);

    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    console.error('Error deleting review:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//Average rating (per role)
router.get('/average-ratings', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.role, ROUND(AVG(r.rating), 2) AS average_rating
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      GROUP BY u.role
    `);

    const response = {};
    result.rows.forEach(row => {
      response[row.role] = parseFloat(row.average_rating);
    });

    res.json(response);
  } catch (err) {
    console.error('Error fetching average ratings:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;
