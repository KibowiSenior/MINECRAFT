const net = require('net');
const crypto = require('crypto');
const fs = require('fs');

// Load configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

class MinecraftProxy {
    constructor() {
        this.servers = new Map();
        this.connections = new Map();
        this.bannedIPs = new Set();
        this.loadServers();
        this.loadBans();
    }

    // Load protected servers from database
    loadServers() {
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database(config.database.path);
        
        db.all('SELECT * FROM servers WHERE status = "active"', (err, rows) => {
            if (err) {
                console.error('Failed to load servers:', err);
                return;
            }
            
            this.servers.clear();
            rows.forEach(server => {
                this.servers.set(server.proxy_port, {
                    id: server.id,
                    real_ip: server.real_ip,
                    real_port: server.real_port,
                    proxy_port: server.proxy_port
                });
            });
            
            console.log(`📊 Loaded ${rows.length} protected servers`);
        });
        
        db.close();
    }

    // Load banned IPs from database
    loadBans() {
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database(config.database.path);
        
        db.all('SELECT ip FROM bans WHERE expires_at > datetime("now") OR expires_at IS NULL', (err, rows) => {
            if (err) {
                console.error('Failed to load bans:', err);
                return;
            }
            
            this.bannedIPs.clear();
            rows.forEach(ban => {
                this.bannedIPs.add(ban.ip);
            });
            
            console.log(`🚫 Loaded ${rows.length} banned IPs`);
        });
        
        db.close();
    }

    // Start proxy server
    start() {
        // Start listening on all configured proxy ports
        this.servers.forEach((server, proxyPort) => {
            const proxyServer = net.createServer((clientSocket) => {
                this.handleConnection(clientSocket, server);
            });

            proxyServer.listen(proxyPort, '0.0.0.0', () => {
                console.log(`🛡️  Proxy listening on port ${proxyPort} -> ${server.real_ip}:${server.real_port}`);
            });

            proxyServer.on('error', (err) => {
                console.error(`❌ Proxy server error on port ${proxyPort}:`, err);
            });
        });

        // Reload servers every 30 seconds
        setInterval(() => {
            this.loadServers();
            this.loadBans();
        }, 30000);
    }

    // Handle incoming client connection
    handleConnection(clientSocket, server) {
        const clientIP = clientSocket.remoteAddress;
        const connectionId = crypto.randomUUID();
        
        console.log(`🔗 New connection from ${clientIP} to proxy port ${server.proxy_port}`);

        // Check if IP is banned
        if (this.bannedIPs.has(clientIP)) {
            console.log(`🚫 Blocked connection from banned IP: ${clientIP}`);
            clientSocket.destroy();
            return;
        }

        // Store connection info
        this.connections.set(connectionId, {
            clientSocket,
            server,
            clientIP,
            startTime: Date.now()
        });

        // Create connection to real server
        const serverSocket = new net.Socket();
        
        serverSocket.connect(server.real_port, server.real_ip, () => {
            console.log(`✅ Connected to real server ${server.real_ip}:${server.real_port}`);
            
            // Set up data forwarding
            this.setupDataForwarding(clientSocket, serverSocket, connectionId);
        });

        serverSocket.on('error', (err) => {
            console.log(`❌ Failed to connect to real server ${server.real_ip}:${server.real_port}:`, err.message);
            
            // Send offline MOTD to client
            this.sendOfflineMOTD(clientSocket);
            this.cleanupConnection(connectionId);
        });

        clientSocket.on('error', (err) => {
            console.log(`❌ Client connection error:`, err.message);
            this.cleanupConnection(connectionId);
        });

        clientSocket.on('close', () => {
            console.log(`🔌 Client disconnected: ${clientIP}`);
            this.cleanupConnection(connectionId);
        });
    }

    // Set up bidirectional data forwarding
    setupDataForwarding(clientSocket, serverSocket, connectionId) {
        let clientBuffer = Buffer.alloc(0);
        let serverBuffer = Buffer.alloc(0);
        let handshakeComplete = false;

        // Client -> Server
        clientSocket.on('data', (data) => {
            if (!handshakeComplete) {
                clientBuffer = Buffer.concat([clientBuffer, data]);
                
                // Try to parse handshake
                const handshakeResult = this.parseHandshake(clientBuffer);
                if (handshakeResult) {
                    handshakeComplete = true;
                    console.log(`📦 Handshake parsed: ${handshakeResult.protocol} ${handshakeResult.hostname}:${handshakeResult.port}`);
                    
                    // Forward the handshake to server
                    serverSocket.write(clientBuffer);
                    clientBuffer = Buffer.alloc(0);
                }
            } else {
                // Forward all other data
                serverSocket.write(data);
            }
        });

        // Server -> Client
        serverSocket.on('data', (data) => {
            if (!handshakeComplete) {
                serverBuffer = Buffer.concat([serverBuffer, data]);
                
                // Try to parse server response
                const responseResult = this.parseServerResponse(serverBuffer);
                if (responseResult) {
                    console.log(`📦 Server response parsed: ${responseResult.status}`);
                    
                    // Forward response to client
                    clientSocket.write(serverBuffer);
                    serverBuffer = Buffer.alloc(0);
                }
            } else {
                // Forward all other data
                clientSocket.write(data);
            }
        });

        serverSocket.on('close', () => {
            console.log(`🔌 Server connection closed`);
            clientSocket.destroy();
            this.cleanupConnection(connectionId);
        });
    }

    // Parse Minecraft handshake packet
    parseHandshake(buffer) {
        try {
            if (buffer.length < 3) return null;
            
            let offset = 0;
            
            // Read packet length (VarInt)
            const lengthResult = this.readVarInt(buffer, offset);
            if (!lengthResult) return null;
            
            const packetLength = lengthResult.value;
            offset = lengthResult.offset;
            
            if (buffer.length < offset + packetLength) return null;
            
            // Read packet ID (VarInt)
            const idResult = this.readVarInt(buffer, offset);
            if (!idResult || idResult.value !== 0) return null; // Handshake packet ID is 0
            
            offset = idResult.offset;
            
            // Read protocol version (VarInt)
            const protocolResult = this.readVarInt(buffer, offset);
            if (!protocolResult) return null;
            
            offset = protocolResult.offset;
            
            // Read server address (String)
            const addressResult = this.readString(buffer, offset);
            if (!addressResult) return null;
            
            offset = addressResult.offset;
            
            // Read server port (Unsigned Short)
            if (buffer.length < offset + 2) return null;
            const port = buffer.readUInt16BE(offset);
            offset += 2;
            
            // Read next state (VarInt)
            const stateResult = this.readVarInt(buffer, offset);
            if (!stateResult) return null;
            
            return {
                protocol: protocolResult.value,
                hostname: addressResult.value,
                port: port,
                state: stateResult.value
            };
        } catch (err) {
            return null;
        }
    }

    // Parse server response packet
    parseServerResponse(buffer) {
        try {
            if (buffer.length < 3) return null;
            
            let offset = 0;
            
            // Read packet length (VarInt)
            const lengthResult = this.readVarInt(buffer, offset);
            if (!lengthResult) return null;
            
            const packetLength = lengthResult.value;
            offset = lengthResult.offset;
            
            if (buffer.length < offset + packetLength) return null;
            
            // Read packet ID (VarInt)
            const idResult = this.readVarInt(buffer, offset);
            if (!idResult) return null;
            
            return {
                status: idResult.value === 0 ? 'status' : 'login'
            };
        } catch (err) {
            return null;
        }
    }

    // Read VarInt from buffer
    readVarInt(buffer, offset) {
        let value = 0;
        let position = 0;
        
        while (offset < buffer.length) {
            const byte = buffer[offset++];
            value |= (byte & 0x7F) << position;
            
            if ((byte & 0x80) === 0) {
                return { value, offset };
            }
            
            position += 7;
            if (position >= 32) {
                return null; // VarInt too large
            }
        }
        
        return null; // Incomplete VarInt
    }

    // Read String from buffer
    readString(buffer, offset) {
        const lengthResult = this.readVarInt(buffer, offset);
        if (!lengthResult) return null;
        
        const stringLength = lengthResult.value;
        const newOffset = lengthResult.offset + stringLength;
        
        if (buffer.length < newOffset) return null;
        
        const value = buffer.toString('utf8', lengthResult.offset, newOffset);
        return { value, offset: newOffset };
    }

    // Send offline MOTD to client
    sendOfflineMOTD(clientSocket) {
        try {
            // Create a simple offline response
            const motd = {
                version: {
                    name: "CloudNord Shield",
                    protocol: 47
                },
                players: {
                    max: 0,
                    online: 0
                },
                description: {
                    text: "§bProtected by §3CloudNord Shield"
                }
            };

            const response = JSON.stringify(motd);
            const responseLength = Buffer.byteLength(response, 'utf8');
            
            // Create response packet
            const packet = Buffer.alloc(5 + responseLength);
            let offset = 0;
            
            // Packet length (VarInt)
            offset = this.writeVarInt(packet, offset, responseLength + 1);
            
            // Packet ID (VarInt) - Status response
            offset = this.writeVarInt(packet, offset, 0);
            
            // Response string
            packet.write(response, offset, 'utf8');
            
            clientSocket.write(packet);
            console.log(`📤 Sent offline MOTD to client`);
        } catch (err) {
            console.error('Failed to send offline MOTD:', err);
        }
    }

    // Write VarInt to buffer
    writeVarInt(buffer, offset, value) {
        while (value >= 0x80) {
            buffer[offset++] = (value & 0xFF) | 0x80;
            value >>>= 7;
        }
        buffer[offset++] = value & 0xFF;
        return offset;
    }

    // Clean up connection
    cleanupConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            const duration = Date.now() - connection.startTime;
            console.log(`🧹 Cleaned up connection from ${connection.clientIP} (duration: ${duration}ms)`);
            this.connections.delete(connectionId);
        }
    }
}

// Start the proxy
const proxy = new MinecraftProxy();
proxy.start();

console.log('🛡️  CloudNord Shield Proxy started');
console.log('📊 Monitoring protected servers...');

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛡️  Shutting down CloudNord Shield Proxy...');
    process.exit(0);
});
