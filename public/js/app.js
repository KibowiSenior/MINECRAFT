function cloudnordApp() {
    return {
        // State
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: null,
        activeTab: 'servers',
        showAddServerModal: false,
        showAddBanModal: false,
        
        // Data
        dashboard: {
            totalServers: 0,
            activeServers: 0,
            bannedIPs: 0,
            systemStatus: 'online'
        },
        servers: [],
        bans: [],
        
        // Forms
        loginForm: {
            username: '',
            password: ''
        },
        serverForm: {
            real_ip: '',
            real_port: ''
        },
        banForm: {
            ip: '',
            reason: ''
        },
        
        // Methods
        init() {
            this.token = localStorage.getItem('cloudnord_token');
            if (this.token) {
                this.isAuthenticated = true;
                this.loadDashboard();
                this.loadServers();
                this.loadBans();
            }
        },
        
        async login() {
            this.loading = true;
            this.error = null;
            
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.loginForm)
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    this.token = data.token;
                    this.user = { username: data.username };
                    this.isAuthenticated = true;
                    localStorage.setItem('cloudnord_token', this.token);
                    this.loadDashboard();
                    this.loadServers();
                    this.loadBans();
                } else {
                    this.error = data.error || 'Login failed';
                }
            } catch (err) {
                this.error = 'Network error. Please try again.';
            } finally {
                this.loading = false;
            }
        },
        
        logout() {
            this.isAuthenticated = false;
            this.user = null;
            this.token = null;
            localStorage.removeItem('cloudnord_token');
            this.dashboard = { totalServers: 0, activeServers: 0, bannedIPs: 0, systemStatus: 'online' };
            this.servers = [];
            this.bans = [];
        },
        
        async loadDashboard() {
            try {
                const response = await fetch('/api/dashboard', {
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
                
                if (response.ok) {
                    this.dashboard = await response.json();
                }
            } catch (err) {
                console.error('Failed to load dashboard:', err);
            }
        },
        
        async loadServers() {
            try {
                const response = await fetch('/api/servers', {
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
                
                if (response.ok) {
                    this.servers = await response.json();
                }
            } catch (err) {
                console.error('Failed to load servers:', err);
            }
        },
        
        async loadBans() {
            try {
                const response = await fetch('/api/bans', {
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
                
                if (response.ok) {
                    this.bans = await response.json();
                }
            } catch (err) {
                console.error('Failed to load bans:', err);
            }
        },
        
        async addServer() {
            this.loading = true;
            
            try {
                const response = await fetch('/api/servers', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify(this.serverForm)
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    this.servers.unshift(data);
                    this.showAddServerModal = false;
                    this.serverForm = { real_ip: '', real_port: '' };
                    this.loadDashboard();
                    this.showNotification('Server protection added successfully!', 'success');
                } else {
                    this.showNotification(data.error || 'Failed to add server', 'error');
                }
            } catch (err) {
                this.showNotification('Network error. Please try again.', 'error');
            } finally {
                this.loading = false;
            }
        },
        
        async removeServer(serverId) {
            if (!confirm('Are you sure you want to remove this server protection?')) {
                return;
            }
            
            try {
                const response = await fetch(`/api/servers/${serverId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
                
                if (response.ok) {
                    this.servers = this.servers.filter(s => s.id !== serverId);
                    this.loadDashboard();
                    this.showNotification('Server protection removed', 'success');
                } else {
                    const data = await response.json();
                    this.showNotification(data.error || 'Failed to remove server', 'error');
                }
            } catch (err) {
                this.showNotification('Network error. Please try again.', 'error');
            }
        },
        
        async addBan() {
            this.loading = true;
            
            fetch('/api/bans', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(this.banForm)
            })
            .then(response => response.json())
            .then(data => {
                if (data.id) {
                    this.bans.unshift(data);
                    this.showAddBanModal = false;
                    this.banForm = { ip: '', reason: '' };
                    this.loadDashboard();
                    this.showNotification('IP banned successfully!', 'success');
                } else {
                    this.showNotification(data.error || 'Failed to add ban', 'error');
                }
            })
            .catch(err => {
                this.showNotification('Network error. Please try again.', 'error');
            })
            .finally(() => {
                this.loading = false;
            });
        },
        
        async removeBan(banId) {
            if (!confirm('Are you sure you want to remove this ban?')) {
                return;
            }
            
            try {
                const response = await fetch(`/api/bans/${banId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
                
                if (response.ok) {
                    this.bans = this.bans.filter(b => b.id !== banId);
                    this.loadDashboard();
                    this.showNotification('Ban removed successfully', 'success');
                } else {
                    const data = await response.json();
                    this.showNotification(data.error || 'Failed to remove ban', 'error');
                }
            } catch (err) {
                this.showNotification('Network error. Please try again.', 'error');
            }
        },
        
        formatDate(dateString) {
            return new Date(dateString).toLocaleDateString();
        },
        
        showNotification(message, type) {
            // Simple notification - you could enhance this with a proper toast library
            alert(message);
        }
    }
}
