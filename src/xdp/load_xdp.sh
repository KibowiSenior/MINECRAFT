#!/bin/bash

# CloudNord Shield XDP Loader Script
# This script loads the XDP program onto the network interface

set -e

# Configuration
INTERFACE=${1:-eth0}
XDP_PROGRAM="cloudnord_xdp.o"
SEC_NAME="xdp"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🛡️  CloudNord Shield XDP Loader${NC}"
echo -e "${BLUE}📡 Interface: ${INTERFACE}${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ This script must be run as root${NC}"
   exit 1
fi

# Check if interface exists
if ! ip link show $INTERFACE > /dev/null 2>&1; then
    echo -e "${RED}❌ Interface $INTERFACE not found${NC}"
    exit 1
fi

# Check if XDP program exists
if [ ! -f "$XDP_PROGRAM" ]; then
    echo -e "${RED}❌ XDP program $XDP_PROGRAM not found${NC}"
    echo -e "${YELLOW}💡 Run 'make' first to compile the XDP program${NC}"
    exit 1
fi

# Remove existing XDP program if any
echo -e "${YELLOW}🧹 Removing existing XDP program...${NC}"
ip link set dev $INTERFACE xdp off 2>/dev/null || true

# Load XDP program
echo -e "${BLUE}📦 Loading XDP program onto $INTERFACE...${NC}"
ip link set dev $INTERFACE xdp obj $XDP_PROGRAM sec $SEC_NAME

# Verify XDP program is loaded
if ip link show dev $INTERFACE | grep -q "xdp"; then
    echo -e "${GREEN}✅ XDP program loaded successfully!${NC}"
    echo -e "${GREEN}🛡️  CloudNord Shield XDP protection is active${NC}"
    
    # Show XDP program info
    echo -e "${BLUE}📊 XDP Program Status:${NC}"
    ip link show dev $INTERFACE | grep xdp
else
    echo -e "${RED}❌ Failed to load XDP program${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 CloudNord Shield XDP protection is now active on $INTERFACE${NC}"
