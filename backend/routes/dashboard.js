const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// Example GET route for dashboard data
router.get("/", async (req, res) => {
  try {
    const patients = await pool.query("SELECT COUNT(*) FROM patients");
    const appointments = await pool.query("SELECT COUNT(*) FROM appointments");
    const services = await pool.query("SELECT COUNT(*) FROM services");

    res.json({
      stats: {
        patients: parseInt(patients.rows[0].count),
        appointments: parseInt(appointments.rows[0].count),
        services: parseInt(services.rows[0].count),
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ message: "Failed to load dashboard data" });
  }
});

module.exports = router;
