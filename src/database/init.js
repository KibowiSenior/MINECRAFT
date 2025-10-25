const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Load configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Ensure data directory exists
const dataDir = path.dirname(config.database.path);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new sqlite3.Database(config.database.path);

// Create tables
const createTables = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users table
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    role TEXT DEFAULT 'admin',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME
                )
            `);

            // Servers table
            db.run(`
                CREATE TABLE IF NOT EXISTS servers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    real_ip TEXT NOT NULL,
                    real_port INTEGER NOT NULL,
                    proxy_port INTEGER NOT NULL,
                    status TEXT DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_check DATETIME DEFAULT CURRENT_TIMESTAMP,
                    connection_count INTEGER DEFAULT 0,
                    last_connection DATETIME
                )
            `);

            // Bans table
            db.run(`
                CREATE TABLE IF NOT EXISTS bans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip TEXT NOT NULL,
                    reason TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME,
                    is_active INTEGER DEFAULT 1
                )
            `);

            // Logs table
            db.run(`
                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    level TEXT NOT NULL,
                    message TEXT NOT NULL,
                    ip TEXT,
                    server_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (server_id) REFERENCES servers (id)
                )
            `);

            // Attack attempts table
            db.run(`
                CREATE TABLE IF NOT EXISTS attack_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip TEXT NOT NULL,
                    attack_type TEXT NOT NULL,
                    packet_count INTEGER DEFAULT 1,
                    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_blocked INTEGER DEFAULT 0
                )
            `);

            // Create indexes
            db.run('CREATE INDEX IF NOT EXISTS idx_servers_proxy_port ON servers(proxy_port)');
            db.run('CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status)');
            db.run('CREATE INDEX IF NOT EXISTS idx_bans_ip ON bans(ip)');
            db.run('CREATE INDEX IF NOT EXISTS idx_bans_expires ON bans(expires_at)');
            db.run('CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)');
            db.run('CREATE INDEX IF NOT EXISTS idx_attack_attempts_ip ON attack_attempts(ip)');

            resolve();
        });
    });
};

// Insert default admin user
const createDefaultAdmin = async () => {
    return new Promise((resolve, reject) => {
        // Check if admin user exists
        db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
            if (err) {
                reject(err);
                return;
            }

            if (row) {
                console.log('✅ Admin user already exists');
                resolve();
                return;
            }

            // Create default admin user
            const hashedPassword = bcrypt.hashSync('admin', 10);
            
            db.run(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                ['admin', hashedPassword, 'admin'],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    console.log('✅ Default admin user created (username: admin, password: admin)');
                    resolve();
                }
            );
        });
    });
};

// Initialize database
const init = async () => {
    try {
        console.log('🗄️  Initializing CloudNord Shield database...');
        
        await createTables();
        console.log('✅ Database tables created');
        
        await createDefaultAdmin();
        console.log('✅ Default admin user created');
        
        console.log('🎉 Database initialization completed!');
        
    } catch (err) {
        console.error('❌ Database initialization failed:', err);
        process.exit(1);
    } finally {
        db.close();
    }
};

// Run initialization
if (require.main === module) {
    init();
}

module.exports = { init };
