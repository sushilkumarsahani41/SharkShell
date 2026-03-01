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

## 🐳 Quick Start (Docker)

**Recommended** — deploy with a single command:

```bash
# Download
curl -sO https://raw.githubusercontent.com/sushilkumarsahani41/SharkShell/main/docker-compose.prod.yml
curl -sO https://raw.githubusercontent.com/sushilkumarsahani41/SharkShell/main/init.sh
chmod +x init.sh

# Setup & Run
./init.sh
docker compose -f docker-compose.prod.yml up -d
```

Open **http://localhost:8080** 🚀

### Docker Run (Bring Your Own Database)

```bash
docker run -d -p 8080:80 \
  -e DB_HOST=your-db-host \
  -e DB_USER=your-user \
  -e DB_PASSWORD=your-password \
  -e DB_NAME=sharkshell \
  -v sharkshell-secrets:/app/secrets \
  greatsharktech/sharkshell:latest
```

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
