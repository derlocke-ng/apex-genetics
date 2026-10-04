---
title: Self-Hosting a WireGuard VPN
date: 2025-09-15
tags: [networking, homelab, tutorial]
---

Want secure remote access to your home network? WireGuard is fast, simple, and modern. Here's how to set it up.

## Why WireGuard?

- **Fast** — Much better performance than OpenVPN
- **Simple** — Minimal codebase, easy to audit
- **Modern crypto** — ChaCha20, Curve25519, etc.
- **Cross-platform** — Linux, Windows, macOS, iOS, Android

## Server Setup (Debian/Ubuntu)

```bash
# Install WireGuard
sudo apt install wireguard

# Generate keys
wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
chmod 600 /etc/wireguard/privatekey

# Create config
sudo nano /etc/wireguard/wg0.conf
```

### Server Config (`/etc/wireguard/wg0.conf`)

```ini
[Interface]
PrivateKey = <server-private-key>
Address = 10.0.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
# Client 1
PublicKey = <client-public-key>
AllowedIPs = 10.0.0.2/32
```

### Enable IP Forwarding

```bash
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Start WireGuard

```bash
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
```

## Client Config

```ini
[Interface]
PrivateKey = <client-private-key>
Address = 10.0.0.2/24
DNS = 10.0.0.1  # Use your Pi-hole!

[Peer]
PublicKey = <server-public-key>
Endpoint = your-domain.com:51820
AllowedIPs = 0.0.0.0/0  # Route all traffic through VPN
PersistentKeepalive = 25
```

## Tips

- **Port forwarding:** Open UDP 51820 on your router
- **Dynamic DNS:** Use DuckDNS or similar if you don't have a static IP
- **Multiple devices:** Just add more [Peer] sections

## My Setup

I run WireGuard in an LXC container on Proxmox. Works perfectly. I can access my home network from anywhere, securely.

The service dock on this site? That's where you'll find registration for my VPN (friends/family only, sorry!).

---

Questions? Hit me up. Stay secure! 🔐
