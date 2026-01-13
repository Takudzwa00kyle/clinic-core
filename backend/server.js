const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const pool = require('./config/db'); // Import the database connection pool
const appointmentRoutes = require('./routes/appointment'); // Import appointment routes
const authRoutes = require('./routes/auth'); // Import auth routes
require('./cron/jobs');
const authMiddleware = require('./middlewares/authMiddleware'); // Import authentication middleware
const bcrypt = require('bcrypt'); // Import bcrypt for password hashing
const patientRoutes = require('./routes/patient'); // Import patient routes
const serviceRoutes = require('./routes/services'); // Import service routes
const dashboardRoutes = require('./routes/dashboard'); // Import dashboard routes


// Load environment variables from .env file
dotenv.config();

const app = express();

// Auth routes
app.use('/api/auth', authRoutes); // Use auth routesj

// Middlewares
app.use(cors({
    origin: "http://localhost:3000", // frontend URL
    credentials: true,               // allow cookies
}));
app.use(express.json()); // Parses JSON request bodies

app.use("/api/dashboard", dashboardRoutes);   // Dashboard routes

app.get("/api/test", (req, res) => {
  res.send("Test route works");
});

// Test route (default root)
app.get('/', (req, res) => {
    res.send('ClinicCore backend is running');
});

// Database connection test
app.get('/dbtest', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.send(result.rows[0]);
    } catch (err) {
        console.error('Database connection error:', err);
        res.status(500).send('Database connection error');
    }
});

// Use appointment routes
app.use('/api/appointments', appointmentRoutes);

// Analytics routes
app.use('/api/analytics', require('./routes/analytics'));

// Patient routes
app.use('/api/patients', patientRoutes);

// Service routes
app.use('/api/services', serviceRoutes);

/* Add routes 'HERE' (e.g., auth, patients) 
   e.g:
    const authRoutes = require('./routes/auth');
    app.use('/api/auth', authRoutes);
    
    */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});