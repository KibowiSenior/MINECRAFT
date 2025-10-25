#!/bin/bash

# CloudNord Shield Status Script
# This script shows the status of all CloudNord Shield components

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🛡️  CloudNord Shield Status${NC}"
echo -e "${BLUE}========================${NC}"

# Check PM2 processes
echo -e "${BLUE}📊 Service Status:${NC}"
pm2 status

echo ""

# Check XDP program
echo -e "${BLUE}🔥 XDP Firewall Status:${NC}"
if ip link show dev eth0 | grep -q "xdp"; then
    echo -e "${GREEN}✅ XDP program is loaded${NC}"
    ip link show dev eth0 | grep xdp
else
    echo -e "${YELLOW}⚠️  XDP program not loaded${NC}"
    echo -e "${YELLOW}💡 Run 'sudo ./start.sh' to load XDP protection${NC}"
fi

echo ""

# Check database
echo -e "${BLUE}🗄️  Database Status:${NC}"
if [ -f "data/cloudnord.db" ]; then
    echo -e "${GREEN}✅ Database exists${NC}"
    echo -e "${BLUE}📊 Database info:${NC}"
    sqlite3 data/cloudnord.db "SELECT COUNT(*) as servers FROM servers; SELECT COUNT(*) as bans FROM bans; SELECT COUNT(*) as users FROM users;"
else
    echo -e "${RED}❌ Database not found${NC}"
    echo -e "${YELLOW}💡 Run './setup.sh' to initialize database${NC}"
fi

echo ""

# Check logs
echo -e "${BLUE}📋 Recent Logs:${NC}"
if [ -f "logs/panel.log" ]; then
    echo -e "${BLUE}📊 Panel logs (last 5 lines):${NC}"
    tail -5 logs/panel.log
fi

if [ -f "logs/proxy.log" ]; then
    echo -e "${BLUE}🔗 Proxy logs (last 5 lines):${NC}"
    tail -5 logs/proxy.log
fi

echo ""
echo -e "${GREEN}🎉 Status check completed${NC}"
