#!/bin/bash

# CloudNord Shield Stop Script
# This script stops all components of the CloudNord Shield system

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🛡️  Stopping CloudNord Shield...${NC}"

# Stop PM2 processes
echo -e "${BLUE}🛑 Stopping services...${NC}"
pm2 stop cloudnord-panel 2>/dev/null || true
pm2 stop cloudnord-proxy 2>/dev/null || true

# Remove XDP program if running as root
if [[ $EUID -eq 0 ]]; then
    echo -e "${BLUE}🔥 Removing XDP firewall...${NC}"
    ip link set dev eth0 xdp off 2>/dev/null || true
    echo -e "${GREEN}✅ XDP firewall removed${NC}"
fi

echo -e "${GREEN}✅ CloudNord Shield stopped${NC}"
echo -e "${YELLOW}💡 Use './start.sh' to restart services${NC}"
