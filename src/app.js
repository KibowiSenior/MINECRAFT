const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Load configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Initialize database
const db = new sqlite3.Database(config.database.path);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rate_limit.window_ms,
  max: config.security.rate_limit.max_requests,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, config.security.jwt_secret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      config.security.jwt_secret,
      { expiresIn: '24h' }
    );

    res.json({ token, username: user.username });
  });
});

// Dashboard data
app.get('/api/dashboard', authenticateToken, (req, res) => {
  const queries = [
    'SELECT COUNT(*) as total_servers FROM servers',
    'SELECT COUNT(*) as active_servers FROM servers WHERE status = "active"',
    'SELECT COUNT(*) as banned_ips FROM bans WHERE expires_at > datetime("now") OR expires_at IS NULL'
  ];

  Promise.all(queries.map(query => 
    new Promise((resolve, reject) => {
      db.get(query, (err, result) => {
        if (err) reject(err);
        else resolve(Object.values(result)[0]);
      });
    })
  )).then(([totalServers, activeServers, bannedIPs]) => {
    res.json({
      totalServers,
      activeServers,
      bannedIPs,
      systemStatus: 'online'
    });
  }).catch(err => {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  });
});

// Get all servers
app.get('/api/servers', authenticateToken, (req, res) => {
  db.all('SELECT * FROM servers ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Add server protection
app.post('/api/servers', authenticateToken, (req, res) => {
  const { real_ip, real_port } = req.body;

  if (!real_ip || !real_port) {
    return res.status(400).json({ error: 'Real IP and port required' });
  }

  // Get next available proxy port
  db.get('SELECT MAX(proxy_port) as max_port FROM servers', (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const proxyPort = (result.max_port || config.server.proxy_base_port - 1) + 1;

    // Check if server already exists
    db.get('SELECT * FROM servers WHERE real_ip = ? AND real_port = ?', [real_ip, real_port], (err, existing) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (existing) {
        return res.status(400).json({ error: 'Server already protected' });
      }

      // Insert new server
      db.run(
        'INSERT INTO servers (real_ip, real_port, proxy_port, status) VALUES (?, ?, ?, ?)',
        [real_ip, real_port, proxyPort, 'active'],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to add server' });
          }

          res.json({
            id: this.lastID,
            real_ip,
            real_port,
            proxy_port: proxyPort,
            status: 'active',
            message: 'Protection activated successfully'
          });
        }
      );
    });
  });
});

// Remove server protection
app.delete('/api/servers/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM servers WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Server not found' });
    }

    res.json({ message: 'Server protection removed' });
  });
});

// Get banned IPs
app.get('/api/bans', authenticateToken, (req, res) => {
  db.all('SELECT * FROM bans WHERE expires_at > datetime("now") OR expires_at IS NULL ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Add ban
app.post('/api/bans', authenticateToken, (req, res) => {
  const { ip, reason } = req.body;

  if (!ip) {
    return res.status(400).json({ error: 'IP address required' });
  }

  db.run(
    'INSERT INTO bans (ip, reason) VALUES (?, ?)',
    [ip, reason || 'Manual ban'],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to add ban' });
      }

      res.json({
        id: this.lastID,
        ip,
        reason: reason || 'Manual ban',
        message: 'IP banned successfully'
      });
    }
  );
});

// Remove ban
app.delete('/api/bans/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM bans WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Ban not found' });
    }

    res.json({ message: 'Ban removed successfully' });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🛡️  CloudNord Shield Panel running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔑 Default login: admin/admin`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛡️  Shutting down CloudNord Shield...');
  db.close();
  process.exit(0);
});
