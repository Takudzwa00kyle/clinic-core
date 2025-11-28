const express = require('express');
const { createExcelReport, createPDFReport, createWordReport } = require('../utils/exportReport');
const { sendReportEmail } = require('../utils/sendMail');
const { sendSmsAT } = require('../utils/sendSmsAT');
const { logMilestone } = require('../utils/logMilestone');
const fs = require('fs');
const { auth } = require('../middlewares/authMiddleware'); // Import authentication middleware
const router = express.Router();

// Summarize weekly and monthly analytics for appointments, patients, suburbs, and cities

router.get('/analytics/summary', auth, async (req, res) => {
  const { range } = req.query; // ?range=weekly OR ?range=monthly

  // Only allow certain roles
  const allowedRoles = ['admin', 'doctor', 'dentist'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Unauthorized access' });
  }

  const interval = range === 'monthly' ? '30 days' : '7 days';

  try {
    const [appointments, patients, suburbs, cities] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM appointments WHERE created_at > NOW() - INTERVAL '${interval}'`),
      pool.query(`SELECT COUNT(*) FROM users WHERE role = 'patient' AND created_at > NOW() - INTERVAL '${interval}'`),
      pool.query(`SELECT COUNT(DISTINCT suburb) FROM users WHERE created_at > NOW() - INTERVAL '${interval}'`),
      pool.query(`SELECT COUNT(DISTINCT city) FROM users WHERE created_at > NOW() - INTERVAL '${interval}'`)
    ]);

    res.json({
      total_appointments: Number(appointments.rows[0].count),
      new_patients: Number(patients.rows[0].count),
      active_suburbs: Number(suburbs.rows[0].count),
      active_cities: Number(cities.rows[0].count)
    });

  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Pie chart for procedure types
router.get('/analytics/chart/procedures', auth, async (req, res) => {
  const allowedRoles = ['doctor', 'dentist', 'admin'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const result = await pool.query(`
      SELECT procedure_type, COUNT(*) AS count
      FROM appointments
      GROUP BY procedure_type
    `);

    res.json(result.rows); // e.g., [ { procedure_type: "Dental", count: 15 }, ... ]
  } catch (err) {
    console.error('Pie chart error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Line graph for new patients over time
router.get('/analytics/chart/patients', auth, async (req, res) => {
  const allowedRoles = ['doctor', 'dentist', 'admin'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const { range } = req.query;
  const period = range === 'monthly' ? '30 days' : '7 days';

  try {
    const result = await pool.query(`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM users
      WHERE role = 'patient' AND created_at > NOW() - INTERVAL '${period}'
      GROUP BY date
      ORDER BY date ASC
    `);

    res.json(result.rows); // e.g., [ { date: '2025-07-01', count: 4 }, ... ]
  } catch (err) {
    console.error('Line graph error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Bar chart for appointments per staff
router.get('/analytics/chart/staff', auth, async (req, res) => {
  const allowedRoles = ['doctor', 'dentist', 'admin'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const result = await pool.query(`
      SELECT u.username AS staff, COUNT(a.id) AS count
      FROM appointments a
      JOIN users u ON a.staff_id = u.id
      WHERE a.created_at > NOW() - INTERVAL '30 days'
      GROUP BY u.username
      ORDER BY count DESC
    `);

    res.json(result.rows); // e.g., [ { staff: "dr.chipo", count: 25 }, ... ]
  } catch (err) {
    console.error('Bar chart error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Export analytics report
router.post('/analytics/export', auth, async (req, res) => {
  const { format = 'excel', range = 'weekly' } = req.body;

  const allowedRoles = ['admin', 'doctor', 'dentist'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const interval = range === 'monthly' ? '30 days' : '7 days';

  try {
    const result = await pool.query(`
      SELECT a.created_at, u.username AS staff, a.procedure_type, a.status
      FROM appointments a
      JOIN users u ON a.staff_id = u.id
      WHERE a.created_at > NOW() - INTERVAL '${interval}'
    `);

    const data = result.rows;

    let filePath;
    if (format === 'excel') filePath = await createExcelReport(data);
    else if (format === 'pdf') filePath = await createPDFReport(data);
    else if (format === 'word') filePath = await createWordReport(data);
    else return res.status(400).json({ message: 'Invalid format' });

    res.download(filePath, (err) => {
      if (err) {
        console.error('File download error:', err);
      }

      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('File cleanup error:', err);
        } else {
          console.log('Temporary file deleted:', filePath);
        }
      });
    });
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send report via email
router.post('/analytics/email-report', auth, async (req, res) => {
  const { to, format = 'excel', range = 'weekly' } = req.body;

  if (!['admin', 'doctor', 'dentist'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    const interval = range === 'monthly' ? '30 days' : '7 days';
    const result = await pool.query(`
      SELECT a.created_at, u.username AS staff, a.procedure_type, a.status
      FROM appointments a
      JOIN users u ON a.staff_id = u.id
      WHERE a.created_at > NOW() - INTERVAL '${interval}'
    `);

    const data = result.rows;

    // Export report
    let filePath;
    if (format === 'excel') filePath = await createExcelReport(data);
    else if (format === 'pdf') filePath = await createPDFReport(data);
    else if (format === 'word') filePath = await createWordReport(data);
    else return res.status(400).json({ message: 'Invalid format' });

    // Email it
    await sendReportEmail(
        to,
         `Clinic Report - ${range}`,
          `See attached ${range} report.`,
           filePath
        );

    // Cleanup temporary file
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('File cleanup error:', err);
      } else {
        console.log('Temporary file deleted:', filePath);
      }
    });

    res.json({ message: 'Email sent successfully' });

  } catch (err) {
    console.error('Email report error:', err);
    res.status(500).json({ message: 'Failed to send report' });
  }
});

// Send report via SMS using Africa's Talking
router.post('/analytics/sms-report', auth, async (req, res) => {
  const { to, range = 'weekly' } = req.body;

  if (!['admin', 'doctor', 'dentist'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    const interval = range === 'monthly' ? '30 days' : '7 days';

    const result = await pool.query(`
      SELECT COUNT(*) AS total, procedure_type
      FROM appointments
      WHERE created_at > NOW() - INTERVAL '${interval}'
      GROUP BY procedure_type
    `);

    const lines = result.rows.map(r => `${r.procedure_type}: ${r.total}`).join('\n');
    const message = `📊 Clinic Report (${range}):\n\n${lines}`;

    const response = await sendSmsAT(to, message);
    res.json({ message: 'SMS sent successfully', response });

  } catch (err) {
    console.error('Africa’s Talking SMS Error:', err);
    res.status(500).json({ message: 'Failed to send SMS' });
  }
});

// Fetch SMS logs
router.get('/analytics/sms-logs', auth, async (req, res) => {
  const { to, start, end, search, status, page = 1, limit = 50 } = req.query;

  // Only allow admin and doctor roles
  if (!['admin', 'doctor'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  // Input validation (optional)
  if (start && isNaN(Date.parse(start))) {
    return res.status(400).json({ message: 'Invalid start date' });
  }
  if (end && isNaN(Date.parse(end))) {
    return res.status(400).json({ message: 'Invalid end date' });
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  let baseQuery = `SELECT * FROM sms_logs WHERE 1=1`;
  let countQuery = `SELECT COUNT(*) FROM sms_logs WHERE 1=1`;
  let values = [];
  let conditions = [];
  let paramIndex = 1;

  // Dynamic filters
  if (to) {
    conditions.push(`recipient = $${paramIndex}`);
    values.push(to);
    paramIndex++;
  }
  if (start) {
    conditions.push(`sent_at >= $${paramIndex}`);
    values.push(start);
    paramIndex++;
  }
  if (end) {
    conditions.push(`sent_at <= $${paramIndex}`);
    values.push(end);
    paramIndex++;
  }
  if (search) {
    conditions.push(`message ILIKE $${paramIndex}`);
    values.push(`%${search}%`);
    paramIndex++;
  }
  if (status) {
    conditions.push(`status = $${paramIndex}`);
    values.push(status.toLowerCase());
    paramIndex++;
  }

  // Append conditions to queries
  if (conditions.length > 0) {
    const conditionString = conditions.join(' AND ');
    baseQuery += ` AND ${conditionString}`;
    countQuery += ` AND ${conditionString}`;
  }

  // Add ordering, pagination
  baseQuery += ` ORDER BY sent_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  values.push(parseInt(limit), offset);

  try {
    const [logsResult, countResult] = await Promise.all([
      pool.query(baseQuery, values),
      pool.query(countQuery, values.slice(0, paramIndex - 1)) // count doesn't need limit/offset
    ]);

    res.json({
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count),
      logs: logsResult.rows
    });

  } catch (err) {
    console.error('Fetch SMS logs error:', err);
    res.status(500).json({ message: 'Failed to fetch SMS logs' });
  }
});


// Fetch popular times and locations
router.get('/analytics/popular', auth, async (req, res) => {
  if (!['admin', 'doctor', 'dentist'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    const timeQuery = `
      SELECT 
        TO_CHAR(created_at, 'Day') AS day,
        EXTRACT(HOUR FROM created_at) AS hour,
        COUNT(*) AS count
      FROM appointments
      GROUP BY day, hour
      ORDER BY count DESC
      LIMIT 10
    `;

    const locationQuery = `
      SELECT suburb, COUNT(*) AS count
      FROM users
      WHERE suburb IS NOT NULL
      GROUP BY suburb
      ORDER BY count DESC
      LIMIT 10
    `;

    const [timesResult, locationsResult] = await Promise.all([
      pool.query(timeQuery),
      pool.query(locationQuery)
    ]);

    res.json({
      popular_times: timesResult.rows,
      popular_locations: locationsResult.rows
    });
  } catch (err) {
    console.error('Popular analytics error:', err);
    res.status(500).json({ message: 'Error retrieving popular times and locations' });
  }
});

// Milestone stats for users, suburbs, and cities
router.get('/analytics/milestones', auth, async (req, res) => {
  try {
    const [userCount, suburbCount, cityCount] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(DISTINCT suburb) FROM users WHERE suburb IS NOT NULL'),
      pool.query('SELECT COUNT(DISTINCT city) FROM users WHERE city IS NOT NULL')
    ]);

    res.json({
      total_users: userCount.rows[0].count,
      unique_suburbs: suburbCount.rows[0].count,
      unique_cities: cityCount.rows[0].count,
      goals: {
        users: 'Target: 1000+',
        suburbs: 'Target: 25+',
        cities: 'Target: 10+'
      }
    });
  } catch (err) {
    console.error('Milestone error:', err);
    res.status(500).json({ message: 'Error retrieving milestone stats' });
  }
});

// Dashboard with comprehensive analytics
router.get('/analytics/dashboard', auth, async (req, res) => {
  if (!['admin', 'doctor', 'dentist'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const [
      totalAppointments,
      totalUsers,
      totalProcedures,
      popularTimes,
      popularLocations,
      uniqueSuburbs,
      uniqueCities
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM appointments'),
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(DISTINCT procedure_type) FROM appointments'),
      pool.query(`
        SELECT 
          TO_CHAR(created_at, 'Day') AS day, 
          EXTRACT(HOUR FROM created_at) AS hour, 
          COUNT(*) AS count
        FROM appointments
        GROUP BY day, hour
        ORDER BY count DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT suburb, COUNT(*) AS count
        FROM users
        WHERE suburb IS NOT NULL
        GROUP BY suburb
        ORDER BY count DESC
        LIMIT 5
      `),
      pool.query('SELECT COUNT(DISTINCT suburb) FROM users WHERE suburb IS NOT NULL'),
      pool.query('SELECT COUNT(DISTINCT city) FROM users WHERE city IS NOT NULL')
    ]);

    // 🎯 Define milestone tiers
    const userMilestones = [100, 500, 1000, 5000, 10000, 50000, 100000];
    const suburbMilestones = [5, 10, 25, 50, 100, 200];
    const cityMilestones = [3, 5, 10, 20];

    // 📈 Determine current milestone status
    const currentUsers = parseInt(totalUsers.rows[0].count);
    const currentSuburbs = parseInt(uniqueSuburbs.rows[0].count);
    const currentCities = parseInt(uniqueCities.rows[0].count);

    const nextUserGoal = userMilestones.find(m => currentUsers < m) || 'Maxed!';
    const nextSuburbGoal = suburbMilestones.find(m => currentSuburbs < m) || 'Maxed!';
    const nextCityGoal = cityMilestones.find(m => currentCities < m) || 'Maxed!';

    // Log milestones if current counts exceed any defined milestones
    await Promise.all(userMilestones.map(m => {
      if (currentUsers >= m) return logMilestone('users', m);
    }));
    await Promise.all(suburbMilestones.map(m => {
      if (currentSuburbs >= m) return logMilestone('suburbs', m);
    }))
    await Promise.all(cityMilestones.map(m => {
      if (currentCities >= m) return logMilestone('cities', m);
    }))
    

    res.json({
      stats: {
        appointments: totalAppointments.rows[0].count,
        users: currentUsers,
        procedures: totalProcedures.rows[0].count
      },
      popular: {
        times: popularTimes.rows,
        locations: popularLocations.rows
      },
      milestones: {
        users: {
          current: currentUsers,
          next_goal: nextUserGoal
        },
        suburbs: {
          current: currentSuburbs,
          next_goal: nextSuburbGoal
        },
        cities: {
          current: currentCities,
          next_goal: nextCityGoal
        }
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Error loading dashboard data' });
  }
});

// Fetch milestone history
router.get('/analytics/milestones/history', auth, async (req, res) => {
  if (!['admin', 'doctor'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM milestone_logs ORDER BY reached_at DESC LIMIT 50`
    );

    res.json({ milestones: result.rows });
  } catch (err) {
    console.error('Milestone history error:', err);
    res.status(500).json({ message: 'Error fetching milestone history' });
  }
});

// Route: GET /analytics/revenue?range=weekly|monthly&role=doctor|dentist|nurse
router.get('/analytics/revenue', auth, async (req, res) => {
  const { range = 'monthly', role } = req.query;

  // Only allow access for admin
  if (!['admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Unauthorized access' });
  }

  const interval = range === 'monthly' ? '30 days' : '7 days';

  try {
    let query = `
      SELECT 
        s.role, 
        p.method, 
        SUM(s.price) AS total_revenue
      FROM payments p
      JOIN appointments a ON p.appointment_id = a.id
      JOIN appointment_services aps ON aps.appointment_id = a.id
      JOIN services s ON aps.service_id = s.id
      WHERE p.status = 'confirmed'
        AND p.created_at > NOW() - INTERVAL '${interval}'
    `;

    const values = [];

    // Add role filter if provided
    if (role) {
      query += ` AND s.role = $1`;
      values.push(role);
    }

    query += ` GROUP BY s.role, p.method ORDER BY s.role, p.method`;

    const result = await pool.query(query, values);
    res.json({ range, role: role || 'all', breakdown: result.rows });

  } catch (err) {
    console.error('Revenue analytics error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Export revenue breakdown
router.post('/analytics/revenue/export', auth, async (req, res) => {
  const { range = 'monthly', role, format = 'excel' } = req.body;

  if (!['admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const interval = range === 'monthly' ? '30 days' : '7 days';

  try {
    let baseQuery = `
      SELECT 
        s.role, 
        p.method, 
        SUM(s.price) AS total_revenue
      FROM payments p
      JOIN appointments a ON p.appointment_id = a.id
      JOIN appointment_services aps ON aps.appointment_id = a.id
      JOIN services s ON aps.service_id = s.id
      WHERE p.status = 'confirmed'
        AND p.created_at > NOW() - INTERVAL '${interval}'
    `;

    let values = [];
    if (role) {
      baseQuery += ` AND s.role = $1`;
      values.push(role);
    }

    baseQuery += ` GROUP BY s.role, p.method ORDER BY s.role, p.method`;

    const result = await pool.query(baseQuery, values);
    const data = result.rows;

    // 👇 Use existing helpers you have (adjust if needed)
    let filePath;
    if (format === 'excel') filePath = await createExcelReport(data);
    else if (format === 'pdf') filePath = await createPDFReport(data);
    else return res.status(400).json({ message: 'Invalid format' });

    res.download(filePath, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      fs.unlink(filePath, () => {}); // cleanup temp file
    });

  } catch (err) {
    console.error('Export revenue error:', err);
    res.status(500).json({ message: 'Error exporting revenue breakdown' });
  }
});


// Route: GET /analytics/services/usage?range=weekly|monthly&role=doctor|dentist|nurse
router.get('/analytics/services/usage', auth, async (req, res) => {
  const { range = 'monthly', role } = req.query;

  // Restrict to authorized roles
  if (!['admin', 'doctor', 'dentist', 'nurse'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Unauthorized access' });
  }

  const interval = range === 'monthly' ? '30 days' : '7 days';

  try {
    let query = `
      SELECT 
        s.name AS service_name,
        s.role,
        COUNT(*) AS usage_count
      FROM appointment_services aps
      JOIN services s ON aps.service_id = s.id
      JOIN appointments a ON aps.appointment_id = a.id
      WHERE a.created_at > NOW() - INTERVAL '${interval}'
    `;

    const values = [];

    // Apply optional role filter
    if (role) {
      query += ` AND s.role = $1`;
      values.push(role);
    }

    query += ` GROUP BY s.id ORDER BY usage_count DESC`;

    const result = await pool.query(query, values);

    res.json({
      range,
      role: role || 'all',
      most_used_services: result.rows
    });
  } catch (err) {
    console.error('Service usage analytics error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;



