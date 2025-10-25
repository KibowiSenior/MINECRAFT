#!/bin/bash

# CloudNord Shield Setup Script for Ubuntu 22.04+
# This script installs all dependencies and sets up the system

set -e

echo "🛡️  CloudNord Shield Setup Starting..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}This script should not be run as root for security reasons${NC}"
   exit 1
fi

# Update system packages
echo -e "${BLUE}📦 Updating system packages...${NC}"
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
echo -e "${BLUE}📦 Installing Node.js 18.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install required packages
echo -e "${BLUE}📦 Installing system dependencies...${NC}"
sudo apt-get install -y \
    build-essential \
    linux-headers-$(uname -r) \
    libbpf-dev \
    libelf-dev \
    clang \
    llvm \
    pkg-config \
    libssl-dev \
    sqlite3 \
    git \
    curl \
    wget \
    htop \
    net-tools

# Install PM2 globally
echo -e "${BLUE}📦 Installing PM2 process manager...${NC}"
sudo npm install -g pm2

# Create necessary directories
echo -e "${BLUE}📁 Creating project directories...${NC}"
mkdir -p data
mkdir -p logs
mkdir -p src/{proxy,web,xdp}
mkdir -p public/{css,js,images}

# Set up database
echo -e "${BLUE}🗄️  Setting up database...${NC}"
sqlite3 data/cloudnord.db <<EOF
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    real_ip TEXT NOT NULL,
    real_port INTEGER NOT NULL,
    proxy_port INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_check DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);

-- Insert default admin user
INSERT OR IGNORE INTO users (username, password) VALUES ('admin', '\$2a\$10\$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');
EOF

# Install Node.js dependencies
echo -e "${BLUE}📦 Installing Node.js dependencies...${NC}"
npm install

# Set up XDP firewall
echo -e "${BLUE}🔧 Setting up XDP firewall...${NC}"
cd src/xdp
make clean && make
cd ../..

# Set up systemd service
echo -e "${BLUE}🔧 Creating systemd service...${NC}"
sudo tee /etc/systemd/system/cloudnord-shield.service > /dev/null <<EOF
[Unit]
Description=CloudNord Shield DDoS Protection
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable cloudnord-shield

# Set up firewall rules
echo -e "${BLUE}🔥 Configuring firewall...${NC}"
sudo ufw allow 8080/tcp comment "CloudNord Panel"
sudo ufw allow 30000:30100/tcp comment "CloudNord Proxy Ports"
sudo ufw --force enable

# Create startup script
cat > start.sh <<EOF
#!/bin/bash
echo "🛡️  Starting CloudNord Shield..."

# Start XDP firewall
sudo ./src/xdp/cloudnord_xdp

# Start web panel and proxy
pm2 start ecosystem.config.js

echo "✅ CloudNord Shield is running!"
echo "📊 Panel: http://localhost:8080"
echo "🔑 Default login: admin/admin"
EOF

chmod +x start.sh

# Create PM2 ecosystem file
cat > ecosystem.config.js <<EOF
module.exports = {
  apps: [
    {
      name: 'cloudnord-panel',
      script: 'src/app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'cloudnord-proxy',
      script: 'src/proxy/proxy.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

echo -e "${GREEN}✅ CloudNord Shield setup completed!${NC}"
echo -e "${YELLOW}📋 Next steps:${NC}"
echo -e "1. Run: ${BLUE}./start.sh${NC} to start the system"
echo -e "2. Access panel at: ${BLUE}http://your-server-ip:8080${NC}"
echo -e "3. Login with: ${BLUE}admin/admin${NC}"
echo -e "4. Configure your server protection!"
echo ""
echo -e "${GREEN}🛡️  CloudNord Shield is ready to protect your Minecraft servers!${NC}"
