<p align="center">
  <img src="https://img.shields.io/badge/SharkShell-🦈-00d4ff?style=for-the-badge&labelColor=0a1628" alt="SharkShell" />
</p>

<h1 align="center">SharkShell 🦈</h1>

<p align="center">
  <strong>Secure, Self-Hosted Web SSH Client</strong><br/>
  <em>By Greatshark Technologies</em>
</p>

<p align="center">
  <a href="https://hub.docker.com/r/greatsharktech/sharkshell"><img src="https://img.shields.io/docker/pulls/greatsharktech/sharkshell?style=flat-square&logo=docker&label=Docker%20Pulls" alt="Docker Pulls" /></a>
  <img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=flat-square" alt="License: AGPL v3" />
  <img src="https://img.shields.io/badge/react-%2320232a.svg?style=flat-square&logo=react&logoColor=%2361DAFB" alt="React" />
  <img src="https://img.shields.io/badge/nestjs-%23E0234E.svg?style=flat-square&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/docker-%230db7ed.svg?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/postgres-%23316192.svg?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
</p>

---

SharkShell is a modern, self-hosted web-based SSH terminal and keystore manager. Connect to remote servers directly from your browser with enterprise-grade security.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🖥️ **Multi-Tab Terminals** | Open multiple SSH sessions in tabbed terminals |
| 📂 **Workspaces** | Organize sessions into named workspaces with persistence |
| 🔐 **Encrypted Keystore** | AES-256-GCM encryption for all stored credentials |
| 🔑 **SSH Key Management** | Generate, upload, download, and organize SSH keys |
| 👥 **Host & Key Groups** | Color-coded groups with glowing visual indicators |
| 💾 **Session Persistence** | Sessions survive page refresh — click to reconnect |
| 🎨 **Modern UI** | Glassmorphic design with dark mode and micro-animations |
| 🤖 **MCP Access** | Built-in MCP server so AI assistants can manage your hosts and run commands |

## 🐳 Quick Start

### Docker Compose (Recommended)

```bash
# Download the compose file
curl -O https://raw.githubusercontent.com/sushilkumarsahani41/SharkShell/main/docker-compose.yml

# Start SharkShell
docker compose up -d
```

Open **http://localhost:8080** 🚀

To change the port, create a `.env` file next to `docker-compose.yml`:

```env
COMPOSE_PORT=9000
```

**Upgrading** is a single command:

```bash
docker compose pull && docker compose up -d
```

Your database and secrets are in named volumes — they survive every upgrade automatically.

---

### Docker Run (Quick One-Liner)

```bash
docker run -d \
  --name sharkshell \
  -p 8080:80 \
  -v sharkshell-pgdata:/app/pgdata \
  -v sharkshell-secrets:/app/secrets \
  greatsharktech/sharkshell:latest
```

### Bring Your Own Database

Set all four `DB_*` vars — SharkShell skips the internal PostgreSQL and connects to yours instead.

**Docker Compose** — add to `.env`:

```env
DB_HOST=your-db-host
DB_USER=your-user
DB_PASSWORD=your-password
DB_NAME=sharkshell
```

**Docker Run**:

```bash
docker run -d \
  --name sharkshell \
  -p 8080:80 \
  -e DB_HOST=your-db-host \
  -e DB_USER=your-user \
  -e DB_PASSWORD=your-password \
  -e DB_NAME=sharkshell \
  -v sharkshell-secrets:/app/secrets \
  greatsharktech/sharkshell:latest
```

> **First-Time Setup:** On your initial visit, SharkShell detects a fresh database and shows the **Admin Account Setup** screen. Create your admin account — open registration is disabled immediately afterward to secure your instance.

> **Data Persistence:** All data lives in named Docker volumes (`sharkshell-pgdata`, `sharkshell-secrets`). Both `docker run` and `docker compose` use the same volume names, so you can switch between the two without losing anything.

---

### Script-Based Deploy (LXC / VPS / Bare Metal — No Docker)

For low-resource environments (Proxmox LXC containers, small VPS, Raspberry Pi), deploy directly with a bash script. **No Docker daemon, no image pulls, no container overhead** — just Node.js, nginx, and PostgreSQL.

Supported: **Debian / Ubuntu** (apt + systemd) and **Alpine** (apk + OpenRC), x86_64 and arm64.

```bash
git clone https://github.com/sushilkumarsahani41/SharkShell.git
cd SharkShell
sudo ./deploy.sh
```

The script:

1. Installs Node.js 20, nginx, PostgreSQL, logrotate
2. Builds the frontend (Vite) and backend (Nest) on the server
3. Creates a system user `sharkshell` + persistent directories
4. Auto-generates and persists secrets (JWT, encryption key, DB password)
5. Sets up the built-in PostgreSQL (localhost-only, low-resource tuning) — or your external DB if configured
6. Configures nginx (UI on :80, `/api/` proxy, WebSockets, upload ceiling)
7. Installs and enables the service (systemd on Debian/Ubuntu, OpenRC on Alpine)
8. Waits for the health endpoint, then prints next steps

Open **http://server-ip** and complete the first-time admin setup.

**Day-to-day management:**

```bash
sharkshell status      # service + health overview
sharkshell logs        # tail the backend log
sharkshell db          # open a psql shell
sharkshell restart     # restart the backend
sharkshell update      # git pull + rebuild + restart
sharkshell uninstall   # remove everything (--force)
```

**Configuration** lives in `/etc/sharkshell/env` (same `DB_*`, `APP_URL`, `MAX_UPLOAD_GB` variables as Docker). Secrets persist in `/var/lib/sharkshell/secrets/`.

**Low-resource defaults:** Node heap capped at 512 MB (`NODE_MAX_OLD_SPACE_MB`), PostgreSQL tuned for small machines (`shared_buffers=128MB`, `max_connections=50`). Adjust in `/etc/sharkshell/env` and the distro's PostgreSQL conf.

**Requirements:** ~512 MB RAM for runtime (~1.5 GB during the build), ~1 GB disk.

## ⚙️ Configuration

All settings are optional — SharkShell auto-generates secure defaults if not provided.

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `postgres` | Database hostname |
| `DB_PORT` | `5432` | Database port |
| `DB_USER` | `sharkshell` | Database user |
| `DB_PASSWORD` | *auto-generated* | Database password (strong random) |
| `DB_NAME` | `sharkshell` | Database name |
| `ENCRYPTION_KEY` | *auto-generated* | AES-256 key (64-char hex string) |
| `JWT_SECRET` | *auto-generated RSA* | JWT signing key (RSA 2048-bit keypair) |
| `COMPOSE_PORT` | `8080` | Exposed HTTP port |
| `APP_URL` | *auto-detected* | Public `https://` URL. **Required** behind a TLS-terminating reverse proxy or tunnel (Cloudflare Tunnel, nginx with SSL, etc.) — without it, OAuth discovery documents advertise `http://` endpoints and MCP clients like Claude will refuse to register. |
| `MAX_UPLOAD_GB` | `50` | Hard ceiling (in GB) for SFTP uploads — bounds both nginx's `client_max_body_size` and the backend's admin-configurable upload limit. See [docs/SFTP.md](docs/SFTP.md). |

## 🤖 MCP Access

SharkShell ships with a built-in [Model Context Protocol](https://modelcontextprotocol.io) server, so AI assistants like Claude can work with your infrastructure through SharkShell.

**Fastest path — OAuth:** just add the endpoint, no key to copy:

```bash
claude mcp add --transport http sharkshell https://your-sharkshell-host/api/mcp
```

Claude auto-discovers SharkShell's OAuth support and opens a browser approval popup — sign in, pick a capability + host scope, click **Allow**, done. The resulting access key (30-day, silently refreshed) shows up in **Settings → MCP Access** like any other.

**Or manually:** open **Settings → MCP Access**, click **New Access Key** (shown once — copy it), and connect with a header instead:

```bash
claude mcp add --transport http sharkshell https://your-sharkshell-host/api/mcp \
  --header "Authorization: Bearer ssk_your_access_key"
```

Each key is **scoped**: choose **read-only vs. execute**, limit it to **specific hosts or groups** (or all hosts), and optionally set an **expiry**. Scope and capability are enforced server-side on every call, and every tool call is recorded in an **activity log**. Keys can be **reset** (rotate) or **revoked** anytime, and are stored only as SHA-256 hashes.

Available tools:

| Tool | Description |
|------|-------------|
| `list_hosts` | List in-scope SSH hosts (no secrets) |
| `list_ssh_keys` | List keystore metadata + public keys (private keys never leave the server) |
| `run_command` | Execute a command on an in-scope host using its stored credentials (`execute` keys only) |
| `download_file` | Read a text file from an in-scope host over SFTP |
| `upload_file` | Write a text file to an in-scope host over SFTP (`execute` keys only) |

📖 **Full guide, tool schemas, and security model: [docs/MCP.md](docs/MCP.md)**

> ⚠️ `run_command` is a real shell — a scoped `execute` key can read that host's own secrets via commands. Scope keys tightly and serve SharkShell over HTTPS.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────┐
│          SharkShell Container                │
│                                              │
│   ┌──────────┐         ┌──────────────┐      │
│   │  nginx   │────────▶│  Nest.js API │      │
│   │  :80     │ /api/*  │  :3002       │      │
│   │          │ ws://   │              │      │
│   │ (React   │         │  SSH Proxy   │      │
│   │  SPA)    │         │  Auth/Crypto │      │
│   └──────────┘         └──────┬───────┘      │
│                               │              │
└───────────────────────────────┼──────────────┘
                                │
                        ┌───────▼───────┐
                        │  PostgreSQL   │
                        │  (internal    │
                        │   or external)│
                        └───────────────┘
```

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, xterm.js |
| **Backend** | NestJS 10, Socket.IO, ssh2 |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (RS256 / HS256), bcrypt |
| **Encryption** | AES-256-GCM |
| **Container** | Docker, nginx, supervisord |

## 🔒 Security

- **First-Time Lockdown** — Seamless admin account setup on blank databases; open registration is blocked once the admin is established.
- **RSA JWT Keys** — auto-generated 2048-bit RSA keypair for token signing
- **AES-256-GCM** — all passwords and private keys encrypted at rest
- **Strong Defaults** — auto-generated database passwords and encryption keys
- **Non-Root Container** — runs as unprivileged user inside Docker
- **Persistent Secrets** — keys stored in Docker volume, survive restarts

## 🛠️ Development

```bash
# Clone
git clone https://github.com/sushilkumarsahani41/SharkShell.git
cd SharkShell

# Backend
cd backend && npm install && npm run start:dev

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

Backend runs on `http://localhost:3002`, Frontend on `http://localhost:5173`

## 📄 License

Copyright © 2026 **Greatshark Technologies**. All Rights Reserved.

SharkShell is released under the **GNU Affero General Public License v3.0 (AGPLv3)**.

**You are free to:**
- ✅ Use, run, and modify for personal or internal business use

**You must:**
- 📝 Publish source code if you offer a modified version as a network service (SaaS)

**Commercial Licenses** are available for enterprises that wish to embed SharkShell into proprietary software. Contact Greatshark Technologies for details.

---

<p align="center">
  <strong>Made with 💙 by <a href="https://github.com/sushilkumarsahani41">Greatshark Technologies</a></strong>
</p>
