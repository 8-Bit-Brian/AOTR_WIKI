const mysql = require('mysql2');
const express = require('express');


const app = express();
const PORT = process.env.PORT || 5000;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});


app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function sendDatabaseError(res, error) {
  console.error('Database query failed:', error);
  res.status(500).json({ error: 'Internal server error' });
}

app.get('/ready', (req, res) => {
  pool.execute('SELECT 1 FROM units LIMIT 0', (error) => {
    if (error) {
      console.error('Database readiness check failed:', error);
      return res.status(503).json({ status: 'not_ready' });
    }

    return res.status(200).json({ status: 'ready' });
  });
});

app.get('/api/allunits', (req, res) => {
  console.log('Received request for all units');
  pool.execute('SELECT * FROM units', (error, result) => {
    if (error) {
      return sendDatabaseError(res, error);
    }

    return res.json(result);
  });
});

app.get('/api/unit-search', (req, res) => {
  const unitName = req.query.unit_name;

  if (typeof unitName !== 'string') {
    return res.status(400).json({ error: 'unit_name must be a string' });
  }

  const normalizedName = unitName.trim();
  if (normalizedName.length > 200) {
    return res.status(400).json({ error: 'unit_name must be 200 characters or fewer' });
  }

  if (!normalizedName) {
    return pool.execute('SELECT * FROM units', (error, result) => {
      if (error) {
        return sendDatabaseError(res, error);
      }

      return res.json(result);
    });
  }

  pool.execute(
    'SELECT * FROM units WHERE name LIKE ?',
    [`%${normalizedName}%`],
    (error, result) => {
      if (error) {
        return sendDatabaseError(res, error);
      }

      return res.json(result);
    }
  );
});

const server = app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close((serverError) => {
    if (serverError) {
      console.error('Error closing HTTP server:', serverError);
      process.exitCode = 1;
    }

    pool.end((poolError) => {
      if (poolError) {
        console.error('Error closing MySQL pool:', poolError);
        process.exitCode = 1;
      }
    });
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
