---
title: Projects
menu: true
order: 1
description: The Kiwi ecosystem — kiwi-updater, its app catalog, kiwi-killswitch, ensconce and more. Open source, no accounts, no lock-in.
---

# 🥝 Projects

Everything here is part of the **Kiwi** ecosystem: small, open-source tools for Fedora
Silverblue and Bluefin desktops, licensed GPL-3.0-or-later and installable with one command
through [kiwi-updater](#kiwi-updater). No accounts, no store, no vendor.

```
              kiwi-catalog   (a git repo with an apps.list)
                    │
                    ▼
   kiwi-updater:  kiwi (CLI) · Kiwi Apps (GTK4) · systemd timers
                    │   clones the release tag, runs install.sh,
                    │   keeps it updated in the background
      ┌─────────────┼───────────────┬─────────────────────────┐
      ▼             ▼               ▼                         ▼
 kiwi-updater  kiwi-killswitch   ensconce        kiwi-cli-tools-desktop
```

---

## 🥝 kiwi-updater {#kiwi-updater}

**Install and update open-source apps from git catalogs** on Silverblue, Bluefin and other
ostree systems. An app is just a git repo with a `kiwi.manifest` and an `install.sh`;
`kiwi` clones it, checks out its latest release tag, runs its installer and keeps it updated
in the background — including itself.

- **`kiwi`**, the CLI, and **Kiwi Apps**, a GTK4 desktop app to search, browse and inspect the catalogs
- **Releases are git tags**: apps follow their latest version tag, so pre-releases never sneak in
- **User and system scopes**: user apps live in `~/.local` with no root at all; apps with a root half (like a firewall daemon) are cloned and run as root from `/var/lib`, so root never executes a file you can write
- **Background updates** with systemd timers, and passwordless system *updates* through one polkit-gated helper
- **You decide what runs**: `kiwi info --installer` shows a script before it runs, `kiwi diff` shows what an update changes, `kiwi pin` holds a version

```bash
curl -fsSL https://raw.githubusercontent.com/derlocke-ng/kiwi-updater/main/get-kiwi.sh | bash -s -- --with-system
kiwi catalog add https://github.com/derlocke-ng/kiwi-catalog.git
kiwi list
```

**Status:** 1.7.2 · [GitHub](https://github.com/derlocke-ng/kiwi-updater) · [Changelog](https://github.com/derlocke-ng/kiwi-updater/blob/main/CHANGELOG.md) · [Intro post](/posts/kiwi-updater/)

---

## 📚 kiwi-catalog {#kiwi-catalog}

**The app catalog of the Kiwi Network.** A catalog is just a git repo with an `apps.list`,
so managing a fleet is plain git: add a line to add an app, append `ref=<tag>` to pin it,
delete the line to drop it. A machine's own list always wins over a catalog.

| App | What it is |
|-----|------------|
| [kiwi-updater](#kiwi-updater) | The updater itself — it keeps itself current too |
| [kiwi-killswitch](#kiwi-killswitch) | Fail-closed VPN kill switch for GNOME |
| [ensconce](#ensconce) | Post-installation setup for Bluefin-DX |
| [kiwi-cli-tools-desktop](#kiwi-cli-tools-desktop) | Small desktop CLI helpers |

Got an open-source app that is genuinely usable without an account, a subscription or a
tracker? Add a `kiwi.manifest` and an `install.sh`, tag a release and open a pull request.
The catalog is curated, not audited: being listed means someone thought the app worth having.

[GitHub](https://github.com/derlocke-ng/kiwi-catalog)

---

## 🛡️ kiwi-killswitch {#kiwi-killswitch}

**A fail-closed VPN kill switch for GNOME** on Silverblue and Bluefin. One root daemon owns
the firewall (nftables); a Quick Settings toggle, a GTK4 app and a CLI drive it over D-Bus,
with no password prompt.

- **Fail-closed**: traffic leaves only through the protected WireGuard or OpenVPN tunnel — if the VPN drops, you reboot or you switch networks, everything stays blocked
- **New interfaces can't leak**: tethering or Wi-Fi brought up while armed is blocked by default
- **Three depths**: *standard*, *strict* (also forwarded traffic from containers, VMs and Waydroid) and *paranoid* (netdev egress, catches raw sockets)
- **DNS stays put**: through the VPN, a trusted kiwi-node or a resolver you choose, with an nftables backstop
- **Staged changes**: reconfigure everything, then apply it in one atomic transaction

```bash
kiwi install kiwi-killswitch
```

**Status:** 0.1.0 · [GitHub](https://github.com/derlocke-ng/kiwi-killswitch)

---

## 🏡 ensconce {#ensconce}

**Modular post-installation setup for [Bluefin-DX](https://projectbluefin.io/).** Turns a
fresh install into your configured workstation — packages, Flatpaks, GNOME extensions,
Nextcloud sync, dconf settings and the login screen — from plain list files.

- Modular steps you can `--skip` or run `--only`, with dry-run, logging and auto-resume after reboots
- **Clone a machine**: `ensconce --export` reads a configured system and writes the config for the next one

```bash
kiwi install ensconce
ensconce --init && ensconce
```

**Status:** 2.1.1 · [GitHub](https://github.com/derlocke-ng/ensconce)

---

## 🧰 kiwi-cli-tools-desktop {#kiwi-cli-tools-desktop}

**Three small CLI helpers** for a Linux desktop:

- **`pweb`** — serve the current directory over HTTPS on a random port, to hand a file to another machine on the LAN
- **`select-server`** — a numbered menu of the hosts in your `~/.ssh/config`; pick one and connect
- **`tethering`** — set TTL 64 on traffic from a tethered interface (`--status`, `--off`)

```bash
kiwi install kiwi-cli-tools-desktop
```

**Status:** 1.0.0 · [GitHub](https://github.com/derlocke-ng/kiwi-cli-tools-desktop)

---

## 🌐 Kiwi Network {#kiwi-network}

The umbrella for all of the above: a **privacy-first approach to self-hosted
infrastructure**, built on one idea — expose as little as possible. Only a WireGuard entry
point faces the internet; everything else lives behind the tunnel. The desktop side
(Silverblue/Bluefin workstations) is where the tools on this page come in.

[kiwi-network.eu](https://kiwi-network.eu) · [GitHub](https://github.com/derlocke-ng/kiwi-network)

---

## 📝 Kiwi Blog {#kiwi-blog}

The engine behind this site: Markdown in, fast static pages out, with a browser-based admin
that commits straight to GitHub. Hosted for free on GitHub Pages.

[GitHub](https://github.com/derlocke-ng/derlocke-blog)

---

## 📧 Contact

- **Email:** [info@derlocke.net](mailto:info@derlocke.net)
- **GitHub:** [github.com/derlocke-ng](https://github.com/derlocke-ng)

Issues and pull requests are welcome on every project.
