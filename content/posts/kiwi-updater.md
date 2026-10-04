---
title: "kiwi-updater: Apps From Git Catalogs on Silverblue and Bluefin"
date: 2026-10-04
tags: [kiwi, linux, silverblue, open-source]
description: Meet kiwi-updater — install and update open-source apps straight from git catalogs on immutable Fedora desktops. No accounts, no store, no vendor.
---

Time for a fresh start on this blog. Most of what used to live here is history; what I actually spend my evenings on now is the **Kiwi** ecosystem, and it starts with one tool: **kiwi-updater**.

<!--more-->

## The problem

On Fedora Silverblue or Bluefin, `/usr` is immutable. That's great — until you want a small tool that isn't a Flatpak and isn't worth layering a package (and rebooting) for. A CLI helper, a GNOME extension, a firewall daemon with a settings app… you end up with a pile of `git clone && ./install.sh` and nothing that keeps it updated.

## The idea

**An app is just a git repo** with two files in its root: a `kiwi.manifest` describing it and an `install.sh` that installs it. **A catalog is just a git repo** with a list of app URLs. `kiwi` reads the catalogs, clones an app, checks out its latest release tag, runs the installer — and then keeps it updated in the background, itself included.

No accounts, no store, no vendor. A catalog is something you can read, fork and send a pull request to.

## Getting started

```bash
# recommended on a desktop: user scope + root-owned system scope, one password prompt
curl -fsSL https://raw.githubusercontent.com/derlocke-ng/kiwi-updater/main/get-kiwi.sh | bash -s -- --with-system

kiwi catalog add https://github.com/derlocke-ng/kiwi-catalog.git
kiwi list
kiwi install kiwi-killswitch
```

Don't want anything outside your home directory? Drop `--with-system`: the minimal install is 100 % `~/.local`, no root, no password, ever. That covers every app that is only files in your home. Prefer clicking? **Kiwi Apps** shows up in your app grid: search, filter and inspect everything in your catalogs.

## Apps with a root half

Some apps are a binary in `~/.local/bin`. Others — like [kiwi-killswitch](/projects.html#kiwi-killswitch) — are a root firewall daemon *and* a desktop app *and* a GNOME extension. The manifest simply says so:

```ini
COMPONENTS=daemon cli gui gnome-extension
SCOPES=user system
ROOT_REASON=installs a root firewall daemon, its D-Bus policy and two systemd units
```

`kiwi` installs each half where it belongs: user parts in `~/.local`, system parts cloned as root into `/var/lib`, because **root must never execute a file the user can write**. Before it asks for your password, it tells you what the password is *for* — that's the `ROOT_REASON` line. Updating a system app afterwards needs no password at all: a single polkit-gated helper only updates apps the administrator already installed.

## You decide what runs

Installing an app runs its `install.sh`, as root if it has a system half. Catalogs are curated, not audited, so kiwi gives you the tools to look first:

```bash
kiwi info --installer <app>  # the exact script an install would run
kiwi diff <app>              # what an update would change, installer included
kiwi pin <app> v1.2.0        # stay on a version until you say otherwise
kiwi install <app> --dry-run # show what would happen, do nothing
kiwi doctor                  # stale locks, version skew, broken lists, timers
```

Releases are git tags shaped like `v1.2.3`, so a pre-release or a scratch tag is never picked up by accident.

## What's in the catalog

| App | |
|-----|---|
| **kiwi-updater** | keeps itself current, too |
| **[kiwi-killswitch](/projects.html#kiwi-killswitch)** | fail-closed VPN kill switch for GNOME — one VPN, no leaks, no password prompts |
| **[ensconce](/projects.html#ensconce)** | turns a fresh Bluefin-DX install into your workstation, from plain list files |
| **[kiwi-cli-tools-desktop](/projects.html#kiwi-cli-tools-desktop)** | `pweb`, `select-server`, `tethering` |

Building something open source that works without an account, a subscription or a tracker? Add a `kiwi.manifest` and an `install.sh`, tag a release and send a PR to [kiwi-catalog](https://github.com/derlocke-ng/kiwi-catalog).

## Where it stands

kiwi-updater is at **1.7.2**. Three full audits went into the 1.x releases, and the [changelog](https://github.com/derlocke-ng/kiwi-updater/blob/main/CHANGELOG.md) documents what each one found and fixed. Still on the roadmap: a registry of trusted catalogs, and signature verification of release tags.

Everything is GPL-3.0-or-later and on [GitHub](https://github.com/derlocke-ng/kiwi-updater). Issues, ideas and catalog PRs are very welcome. 🥝
