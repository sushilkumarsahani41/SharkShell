# SharkShell SFTP Browser

SharkShell includes a built-in SFTP file browser for every stored host — navigate, upload, download, rename, and delete files directly from the dashboard, no separate SFTP client needed.

- **Endpoint:** `/api/sftp/*` (session-based — open a session against a host, then operate on it)
- **Auth:** Same JWT session as the rest of the dashboard (`AuthGuard`)
- **UI:** **Dashboard → SFTP**

---

## 1. Single-pane browsing

Pick a host, connect (password or key passphrase if needed), and browse. Supported operations:

| Action | Notes |
|--------|-------|
| Navigate | Click into directories, breadcrumb path, up-one-level |
| Upload | Pick one or more files from your computer |
| Download | Streams the remote file straight to your browser |
| Rename | Files and directories |
| Delete | Files and directories (directories deleted recursively) |
| New folder | `mkdir` at the current path |

Sessions are held server-side in memory (keyed per user) and auto-close after **15 minutes idle**. Closing the tab or clicking **Disconnect** ends the session immediately; disconnecting just clears that pane back to the host picker without dropping the second pane in dual-pane mode.

## 2. Dual-pane mode (host-to-host transfer)

Click **Split** to open a second pane, connect it to a different host, then drag a file from one pane and drop it on the other. The transfer streams **server-side** directly between the two hosts' SFTP connections — the file never round-trips through your browser. Only files (not directories) can be transferred this way.

The floating upload panel (bottom-right, Google Drive-style) shows progress for both kinds of transfer:
- **Uploads from your computer** — real byte-level progress via `XMLHttpRequest`.
- **Host-to-host transfers** — an indeterminate spinner, since the transfer happens entirely server-side and there's no byte-level progress to report to the browser.

## 3. MCP tools

Two SFTP-backed tools are also exposed to AI assistants over MCP — see [docs/MCP.md](MCP.md) for the full tool list and auth model:

| Tool | Capability | Notes |
|------|-----------|-------|
| `download_file` | any | Text content only, capped at 200 KB. For binaries or larger files, use the SFTP page. |
| `upload_file` | `execute` only | Writes text content to a path, creating or overwriting it. Capped at 200 KB. |

## 4. Upload size limits

Two layers cap upload size, and it's worth knowing how they relate:

1. **`MAX_UPLOAD_GB`** — a hard ceiling set once at deploy time via environment variable. It bounds both:
   - nginx's `client_max_body_size` (templated into `nginx.conf` by `docker-entrypoint.sh` at container start), and
   - the backend's `MAX_UPLOAD_CEILING_MB` (`backend/src/settings/upload-limit.service.ts`), which is also the multer/`FileInterceptor` limit on the upload endpoint.

   **Default: `50` (50GB).** Any admin-configured limit (see below) can never exceed this.

2. **Settings → Organization → Max upload size** — an admin-adjustable limit within that ceiling, stored in the database and enforced per-upload by the backend. This is the one most deployments will actually tune day-to-day (defaults to 500MB); `MAX_UPLOAD_GB` only needs to move if a deployment genuinely needs to raise the ceiling itself above 50GB.

### Setting `MAX_UPLOAD_GB`

**Docker Compose** — add to `.env`:

```env
MAX_UPLOAD_GB=100
```

**Docker Run**:

```bash
docker run -d \
  --name sharkshell \
  -p 8080:80 \
  -e MAX_UPLOAD_GB=100 \
  -v sharkshell-pgdata:/app/pgdata \
  -v sharkshell-secrets:/app/secrets \
  greatsharktech/sharkshell:latest
```

Restart the container after changing it — both nginx and the backend read it once at startup. An invalid or unset value (non-numeric, `0`) falls back to `50`.

Once raised, go to **Settings → Organization** to raise the admin-configured limit up to the new ceiling — bumping `MAX_UPLOAD_GB` alone doesn't change what the app currently accepts, it only raises the maximum an admin is *allowed* to set.
