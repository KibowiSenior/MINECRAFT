#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <linux/udp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

// Configuration
#define MAX_CONNECTIONS_PER_IP 10
#define BAN_DURATION_SECONDS 3600
#define MAX_BANNED_IPS 1000

// Data structures
struct connection_info {
    __u32 ip;
    __u64 last_seen;
    __u32 connection_count;
    __u32 banned;
};

struct ban_entry {
    __u32 ip;
    __u64 banned_until;
};

// Maps
struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, 10000);
    __type(key, __u32);
    __type(value, struct connection_info);
} connection_tracking SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, MAX_BANNED_IPS);
    __type(key, __u32);
    __type(value, struct ban_entry);
} banned_ips SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, __u32);
} config SEC(".maps");

// Helper functions
static inline int is_tcp_packet(struct iphdr *iph) {
    return iph->protocol == IPPROTO_TCP;
}

static inline int is_udp_packet(struct iphdr *iph) {
    return iph->protocol == IPPROTO_UDP;
}

static inline int is_minecraft_port(__be16 port) {
    return bpf_ntohs(port) == 25565 || (bpf_ntohs(port) >= 30000 && bpf_ntohs(port) <= 30100);
}

static inline int is_syn_packet(struct tcphdr *tcph) {
    return tcph->syn && !tcph->ack;
}

static inline int is_syn_flood(struct connection_info *conn) {
    return conn->connection_count > MAX_CONNECTIONS_PER_IP;
}

// Main XDP program
SEC("xdp")
int cloudnord_xdp_filter(struct xdp_md *ctx) {
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;
    
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) {
        return XDP_PASS;
    }
    
    // Only handle IPv4
    if (eth->h_proto != bpf_htons(ETH_P_IP)) {
        return XDP_PASS;
    }
    
    struct iphdr *iph = (struct iphdr *)(eth + 1);
    if ((void *)(iph + 1) > data_end) {
        return XDP_PASS;
    }
    
    // Only handle TCP and UDP
    if (!is_tcp_packet(iph) && !is_udp_packet(iph)) {
        return XDP_PASS;
    }
    
    __u32 client_ip = iph->saddr;
    __u64 current_time = bpf_ktime_get_ns();
    
    // Check if IP is banned
    struct ban_entry *ban = bpf_map_lookup_elem(&banned_ips, &client_ip);
    if (ban && current_time < ban->banned_until) {
        return XDP_DROP;
    }
    
    // Handle TCP packets (Minecraft traffic)
    if (is_tcp_packet(iph)) {
        struct tcphdr *tcph = (struct tcphdr *)(iph + 1);
        if ((void *)(tcph + 1) > data_end) {
            return XDP_PASS;
        }
        
        // Only process Minecraft ports
        if (!is_minecraft_port(tcph->dest)) {
            return XDP_PASS;
        }
        
        // Get or create connection info
        struct connection_info *conn = bpf_map_lookup_elem(&connection_tracking, &client_ip);
        if (!conn) {
            struct connection_info new_conn = {
                .ip = client_ip,
                .last_seen = current_time,
                .connection_count = 1,
                .banned = 0
            };
            bpf_map_update_elem(&connection_tracking, &client_ip, &new_conn, BPF_ANY);
            return XDP_PASS;
        }
        
        // Update connection info
        conn->last_seen = current_time;
        
        // Check for SYN flood
        if (is_syn_packet(tcph)) {
            conn->connection_count++;
            
            if (is_syn_flood(conn)) {
                // Ban the IP
                struct ban_entry ban_entry = {
                    .ip = client_ip,
                    .banned_until = current_time + (BAN_DURATION_SECONDS * 1000000000ULL)
                };
                bpf_map_update_elem(&banned_ips, &client_ip, &ban_entry, BPF_ANY);
                conn->banned = 1;
                return XDP_DROP;
            }
        }
        
        // Reset connection count if not a SYN packet
        if (!is_syn_packet(tcph)) {
            conn->connection_count = 0;
        }
    }
    
    // Handle UDP packets (potential DDoS)
    if (is_udp_packet(iph)) {
        struct udphdr *udph = (struct udphdr *)(iph + 1);
        if ((void *)(udph + 1) > data_end) {
            return XDP_PASS;
        }
        
        // Only process Minecraft ports
        if (!is_minecraft_port(udph->dest)) {
            return XDP_PASS;
        }
        
        // Rate limit UDP packets
        struct connection_info *conn = bpf_map_lookup_elem(&connection_tracking, &client_ip);
        if (conn) {
            conn->last_seen = current_time;
            conn->connection_count++;
            
            // Drop if too many UDP packets
            if (conn->connection_count > MAX_CONNECTIONS_PER_IP) {
                return XDP_DROP;
            }
        }
    }
    
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";
