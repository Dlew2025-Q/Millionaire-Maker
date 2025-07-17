// server.js
// This is the backend server for the Millionaire Maker application.
// It uses Express.js to create an API and connects to a PostgreSQL database.

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config(); // Use dotenv to manage environment variables

const app = express();
const port = process.env.PORT || 3001; // Render will set the PORT environment variable

// --- Database Connection ---
// The connection string is retrieved from the DATABASE_URL environment variable,
// which Render will provide automatically for your PostgreSQL service.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Render's internal connections
  }
});

// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing for all routes
app.use(express.json()); // Enable the express server to parse JSON formatted request bodies

// --- API Endpoints ---

/**
 * @route   GET /api/data/:game
 * @desc    Get all historical data for a specific lottery game
 * @access  Public
 */
app.get('/api/data/:game', async (req, res) => {
  const { game } = req.params;
  const tableName = game.toLowerCase(); // e.g., 'lottomax', 'dailygrand'

  // Basic validation to prevent SQL injection
  if (!['lottomax', 'lotto649', 'dailygrand'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid game specified.' });
  }

  try {
    // Query the database for all rows from the specified game's table
    const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY draw_date ASC`);
    
    // The database stores main_numbers as a string like "{1,2,3,4,5}".
    // We need to parse it into an array of numbers for the frontend.
    const formattedData = result.rows.map(row => ({
        date: new Date(row.draw_date).toISOString().split('T')[0],
        main: row.main_numbers.replace(/[{}]/g, '').split(',').map(Number),
        grand: row.grand_number, // Will be null if the column doesn't exist for that table
        bonus: row.bonus_number
    }));

    res.json(formattedData);
  } catch (err) {
    console.error(`Error fetching data for ${tableName}:`, err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// --- Server Initialization ---
app.listen(port, () => {
  console.log(`Millionaire Maker backend server listening on port ${port}`);
});

