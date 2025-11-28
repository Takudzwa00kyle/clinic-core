const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Import the database connection pool
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const transporter = require('../utils/email'); // Import email transporter
const crypto = require('crypto');
const { auth } = require('../middlewares/authMiddleware'); // Import authentication middleware  
// Login route
router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [identifier]);
        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'User not found' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Block unconfirmed users
        if (!user.confirmed) {
            return res.status(403).json({ message: 'Please confirm your email before logging in.' });
        }

        // Generate JWT token
        const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email , role: user.role } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// REGISTER NEW USER with input validation
router.post('/register', [
    body('username').isLength({min: 7}).withMessage('Username must be at least 7 characters long'),
    body('email').isEmail().withMessage('Invalid email format'),
    body('password')
    .isString().isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
    .matches(/\d/).withMessage('Password must contain at least one number')
  .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character')
  .matches(/[A-Z]/).withMessage('Must include at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Must include at least one lowercase letter'),
    body('role').optional().isIn(['dentist','doctor', 'nurse', 'admin']).withMessage('Role must be one of: dentist, doctor, nurse, admin'),

    body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })

], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { username, password, role, email } = req.body;

    try {
        // Check user already exists
        const userExits = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);

        if (userExits.rows.length > 0) {
            return res.status(400).json({ message: 'Username or Email already taken' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new user 
        const newUser = await pool.query(
            `INSERT INTO users (username, password, role, email) VALUES ($1, $2, $3, $4) RETURNING id, username, email,  role`,
            [username, hashedPassword, role || 'doctor'] // Default role is 'doctor' if not provided
        );

        // Send confirmation email
        const confirmationLink = `http://localhost:5000/api/auth/confirm/${newUser.rows[0].id}`;
        await pool.query(`UPDATE users SET confirmed = false WHERE id = $1`, [newUser.rows[0].id]);

        await transporter.sendMail({
            from: `"Clinic Core" <${process.env.EMAIL_USER}>`,
            to: email, // Use the email provided in the registration
            subject: 'Confirm your email',
            html: `
                <h2>Welcome to the Clinic stystem</h2>
                <p>Hello <strong>${username}</strong>, thank you for registering.</p>
                <p>Please confirm your account by clicking the link below:</p>
                <a href="${confirmationLink}">Confirm My Account</a>
                <p>If you did not register, please ignore this email.</p>
            `
        });
        // Generate JWT token
        const token = jwt.sign({ id: newUser.rows[0].id, role: newUser.rows[0].role, username: newUser.rows[0].username }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json({
            token,
            message: 'User registered successfully',
            user: newUser.rows[0]
        });
    } catch (err) {
        console.error('Error registering user:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// RESEND CONFIRMATION EMAIL
router.post('/resend-confirmation',[
    body('username').isLength({ min: 7 }).withMessage('Username must be at least 7 characters long'),
    body('email').isEmail().withMessage('Invalid email format')
], async (req, res) => {
    const { username } = req.body;
    const { email } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 email = $2', [username, email]);

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'User not found' });
        }

        const user = result.rows[0];

        if (user.confirmed) {
            return res.status(400).json({ message: 'Email already confirmed' });
        }


        const confirmationLink = `http://localhost:5000/api/auth/confirm/${user.id}`;
        const transporter = require('../utils/email'); // Import email transporter


        await transporter.sendMail({
            from: `"Clinic Core" <${process.env.EMAIL_USER}>`,
            to: user.email, // Use the email provided in the request
            subject: 'Resend: Confirm your email',
            html: `
            <h2>Resend Confirmation</h2>
            <p>Hello <strong>${user.username}</strong>,</p>
            <p>It seems you haven't confirmed your email yet. Please click the link below to confirm your account:</p>
            <a href="${confirmationLink}">Confirm My Account</a>
            `
        });

        res.json({ message: 'Confirmation email resent successfully' });
    } catch (err) {
        console.error('Error resending confirmation email:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ROUTE TO SEND RESET LINK
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Invalid email')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'No account with that email' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiration = new Date(Date.now() + 3600000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
      [token, expiration, email]
    );

    const resetLink = `http://localhost:5000/api/auth/reset-password/${token}`;

    await transporter.sendMail({
      from: `"Clinic Core" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset</h2>
        <p>Click below to reset your password. This link will expire in 1 hour:</p>
        <a href="${resetLink}">👉 Reset Password</a>
      `
    });

    res.json({ message: 'Reset link sent' });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ROUTE TO RESET PASSWORD
router.post('/reset-password/:token', [
  body('password')
  .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  .matches(/\d/).withMessage('Password must contain at least one number')
  .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character')
  .matches(/[A-Z]/).withMessage('Must include at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Must include at least one lowercase letter'),

    body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { token } = req.params;
  const { password } = req.body;

  try {
    const userResult = await pool.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(`
      UPDATE users
      SET password = $1, reset_token = NULL, reset_token_expires = NULL
      WHERE id = $2
    `, [hashedPassword, userResult.rows[0].id]);

    res.json({ message: 'Password reset successful' });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE USER ACCOUNT /api/user/:id
router.delete('/users/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    // Only allow self-deletion or admin to delete
    if (req.user.role !== 'admin' && req.user.id != id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted successfully' });

  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;