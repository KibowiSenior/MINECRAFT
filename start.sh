#!/bin/bash

# CloudNord Shield Startup Script
# This script starts all components of the CloudNord Shield system

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🛡️  Starting CloudNord Shield...${NC}"

# Check if running as root for XDP
if [[ $EUID -ne 0 ]]; then
   echo -e "${YELLOW}⚠️  Not running as root. XDP firewall will not be loaded.${NC}"
   echo -e "${YELLOW}💡 Run 'sudo ./start.sh' to enable XDP protection${NC}"
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo -e "${YELLOW}💡 Run './setup.sh' first to install dependencies${NC}"
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}❌ PM2 is not installed${NC}"
    echo -e "${YELLOW}💡 Run './setup.sh' first to install dependencies${NC}"
    exit 1
fi

# Initialize database if it doesn't exist
if [ ! -f "data/cloudnord.db" ]; then
    echo -e "${BLUE}🗄️  Initializing database...${NC}"
    node src/database/init.js
fi

# Load XDP firewall if running as root
if [[ $EUID -eq 0 ]]; then
    echo -e "${BLUE}🔥 Loading XDP firewall...${NC}"
    cd src/xdp
    make clean && make
    ./load_xdp.sh
    cd ../..
    echo -e "${GREEN}✅ XDP firewall loaded${NC}"
fi

# Start services with PM2
echo -e "${BLUE}🚀 Starting CloudNord Shield services...${NC}"

# Stop existing processes
pm2 stop cloudnord-panel 2>/dev/null || true
pm2 stop cloudnord-proxy 2>/dev/null || true

# Start web panel
echo -e "${BLUE}📊 Starting web panel...${NC}"
pm2 start src/app.js --name cloudnord-panel --log logs/panel.log

# Start proxy
echo -e "${BLUE}🔗 Starting Minecraft proxy...${NC}"
pm2 start src/proxy/proxy.js --name cloudnord-proxy --log logs/proxy.log

# Save PM2 configuration
pm2 save

echo -e "${GREEN}✅ CloudNord Shield is running!${NC}"
echo -e "${GREEN}📊 Panel: http://localhost:8080${NC}"
echo -e "${GREEN}🔑 Login: admin/admin${NC}"
echo -e "${GREEN}🛡️  Protection: Active${NC}"

# Show status
echo -e "${BLUE}📊 Service Status:${NC}"
pm2 status

echo -e "${YELLOW}💡 Use 'pm2 logs' to view logs${NC}"
echo -e "${YELLOW}💡 Use 'pm2 stop all' to stop services${NC}"
