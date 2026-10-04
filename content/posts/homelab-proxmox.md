---
title: Setting Up a Home Server with Proxmox
date: 2025-11-20
tags: [homelab, linux, tutorial]
---

Time to talk about one of my favorite topics: homelabbing. Today we're setting up Proxmox VE as the foundation for all your self-hosted services.

## Why Proxmox?

- Free and open source
- Type 1 hypervisor (runs on bare metal)
- Supports VMs and LXC containers
- Web-based management
- Great community

## Hardware Requirements

You don't need fancy hardware. I started with:

```
- Old Dell Optiplex (i5-4590)
- 32GB RAM (upgraded from 8GB)
- 256GB SSD for OS
- 2TB HDD for storage
```

Any x86_64 machine with VT-x/AMD-V support works.

## Installation

1. Download ISO from [proxmox.com](https://proxmox.com)
2. Flash to USB with `dd` or Balena Etcher
3. Boot and follow the installer
4. Access web UI at `https://your-ip:8006`

```bash
# After install, fix the enterprise repo nag
# Edit /etc/apt/sources.list.d/pve-enterprise.list
# Comment out the enterprise repo, add:
deb http://download.proxmox.com/debian/pve bookworm pve-no-subscription
```

## My Current VMs/Containers

| Name | Type | Purpose |
|------|------|---------|
| docker-host | LXC | Runs all my containers |
| pihole | LXC | DNS + Ad blocking |
| nginx-proxy | LXC | Reverse proxy |
| wireguard | LXC | VPN server |
| truenas | VM | NAS + storage |

## Tips

- **Backups:** Use Proxmox Backup Server or simple vzdump
- **Networking:** Set up a bridge, consider VLANs
- **Storage:** ZFS is great if you have the RAM
- **Templates:** Create LXC templates for quick deployments

## Resources

- [Proxmox Wiki](https://pve.proxmox.com/wiki/)
- [r/homelab](https://reddit.com/r/homelab)
- [Techno Tim on YouTube](https://youtube.com/@TechnoTim)

Happy homelabbing! 🖥️
