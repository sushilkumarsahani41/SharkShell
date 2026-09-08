# SharkShell MCP Server

SharkShell ships with a built-in [Model Context Protocol](https://modelcontextprotocol.io) server, letting AI assistants like Claude work with your infrastructure through SharkShell — listing hosts, inspecting keystore metadata, and running commands over SSH using your stored credentials.

- **Transport:** Streamable HTTP (JSON-RPC 2.0 over `POST`; no SSE stream, `GET` → `405`)
- **Endpoint:** `https://<your-sharkshell-host>/api/mcp`
- **Auth:** OAuth 2.1 (DCR or Client ID Metadata Documents), or `Authorization: Bearer ssk_…` (a SharkShell MCP access key)
- **Protocol version:** negotiated — advertises `2025-11-25`, accepts `2025-06-18` and `2025-03-26`. Send `MCP-Protocol-Version` on every post-initialize request; an unknown value is rejected with `400`.
- **Origin:** requests carrying a browser `Origin` header that isn't this instance's own origin (or a value in `MCP_ALLOWED_ORIGINS`) get `403`. Server-to-server callers send no `Origin` and are unaffected.

> Set `APP_URL` to the instance's public `https://` origin. Behind a reverse proxy the backend only sees plain HTTP, and the OAuth discovery documents must advertise `https://` URLs and the correct host.

---

## 1. Connect

### Option A — OAuth (recommended for Claude and most MCP clients)

Just point the client at the endpoint — no manual key needed:

```bash
claude mcp add --transport http sharkshell https://your-sharkshell-host/api/mcp
```

The first tool call gets a `401` whose `WWW-Authenticate` header advertises SharkShell's OAuth metadata (`/.well-known/oauth-protected-resource` — also served at `/.well-known/oauth-protected-resource/api/mcp` — → `/.well-known/oauth-authorization-server`). The client identifies itself with a **Client ID Metadata Document** (an `https://` URL as its `client_id`; `client_id_metadata_document_supported: true`) or, failing that, registers via **RFC 7591 Dynamic Client Registration** — both need no manual setup. It then opens your browser to approve the connection. Sign in to SharkShell if needed, then choose the same **capability** and **host scope** described below and click **Allow** — SharkShell redirects back to the client with an authorization code (PKCE `S256`; the RFC 8707 `resource` parameter binds the token to this MCP endpoint).

- Access tokens are valid **30 days**; a refresh token (**90 days**) renews them silently as long as the client keeps using the connection. Once both expire, or if the key is revoked, the client re-runs the browser approval.
- The resulting key shows up in **Settings → MCP Access** tagged **OAuth**, alongside manually-created keys — reset/revoke work identically.

### Option B — Manual access key

Best for headless/CI clients that can't complete a browser OAuth approval. Open **Settings → MCP Access** and click **New Access Key**. For each key you choose:

| Setting | Options | Effect |
|---------|---------|--------|
| **Label** | free text | Identifies the key (e.g. `Claude Desktop`, `CI bot`). Shown in the activity log. |
| **Capability** | `Read-only` / `Execute` | Read-only keys can only list; they cannot run commands, and `run_command` is not even advertised to them. |
| **Host scope** | `All hosts` / specific hosts + groups | Restricts which hosts the key may see and run commands on. |
| **Expires** | `Never` / `7` / `30` / `90` days | Optional TTL. An expired key is rejected the same way a revoked one is. |

The key is shown **once** at creation — copy it immediately. SharkShell stores only a SHA-256 hash and a short prefix; the plaintext is never persisted and cannot be recovered. Use **Reset** to rotate (keeps label/scope, invalidates the old secret) or **Revoke** to delete.

**Claude Code** — one command:

```bash
claude mcp add --transport http sharkshell https://your-sharkshell-host/api/mcp \
  --header "Authorization: Bearer ssk_your_access_key"
```

**Any MCP client** — `.mcp.json`:

```json
{
  "mcpServers": {
    "sharkshell": {
      "type": "http",
      "url": "https://your-sharkshell-host/api/mcp",
      "headers": { "Authorization": "Bearer ssk_your_access_key" }
    }
  }
}
```

## 2. Tools

| Tool | Capability | Input | Returns |
|------|-----------|-------|---------|
| `list_hosts` | any | — | Hosts **in the key's scope**: `id`, `name`, `hostname`, `port`, `username`, `auth_type`, `key_name`, `group_name`, `has_saved_password`. |
| `list_ssh_keys` | any | — | Keystore metadata: `id`, `name`, `key_type`, `fingerprint`, `public_key`, `group_name`, `has_passphrase`. **Never** private keys. |
| `run_command` | `execute` only | `host` (id or name), `command`, optional `timeout_seconds` (default 30, max 300) | `stdout`, `stderr`, exit code. Output capped at 200 KB. |
| `download_file` | any | `host` (id or name), `path` | Text content of the remote file over SFTP. Not for binary files. Capped at 200 KB. |
| `upload_file` | `execute` only | `host` (id or name), `path`, `content` | Writes `content` to `path` over SFTP, creating or overwriting it. Content capped at 200 KB. |

`run_command`, `download_file`, and `upload_file` all resolve the target host, **re-check it against the key's scope**, then connect with the host's stored credentials (decrypted in memory only).

### Example

```jsonc
// tools/call
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "run_command",
    "arguments": { "host": "web-prod", "command": "uptime" } } }
```

## 3. Security model

**What is never exposed to the model:**
- The access key itself — it lives in the client's transport config, not in tool inputs/outputs.
- SSH private keys and host passwords — decrypted server-side in memory, handed to the SSH connection, never returned or logged.

**Enforcement:**
- **Capability** and **host scope** are enforced **server-side** on every tool call, on the *resolved* host — not just by filtering `list_hosts`. An out-of-scope host id passed directly to `run_command` is denied.
- **Fail-closed scoping:** a scoped key with no hosts/groups selected reaches *no* hosts (empty ≠ all). "All hosts" is an explicit flag.
- **Audit log:** every tool call — success, `denied`, or `error` — is recorded (key label, tool, host, command, timestamp) and shown in **Settings → Activity Log**.

**Known limits (inherent to shell access):**
- `run_command` is a real shell. A command like `cat ~/.ssh/id_rsa` or `env` returns that host's own secrets in stdout. Scope keys tightly and prefer read-only or narrow host scope where possible.
- `download_file`/`upload_file` are for text — config files, logs, scripts, small data. They read/write as UTF-8, so binary files come back garbled. For binary transfers or anything over 200 KB, use the **SFTP** page directly.
- Bearer keys are only as safe as your endpoint's TLS. Serve SharkShell over HTTPS.
- `list_ssh_keys` metadata (names, fingerprints, public keys — no secrets) is visible to **any** valid key regardless of host scope; scoping governs hosts and command execution, not keystore enumeration.

## 4. OAuth reference

SharkShell is its own OAuth 2.1 authorization server and resource server. It implements
[RFC 8414](https://www.rfc-editor.org/rfc/rfc8414) (authorization server metadata),
[RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) (protected resource metadata),
[RFC 7591](https://www.rfc-editor.org/rfc/rfc7591) (dynamic client registration),
[Client ID Metadata Documents](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00),
and [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707) resource indicators — with PKCE (`S256` only),
no client secret (`token_endpoint_auth_method: none`), and rotating refresh tokens for public clients.

| Endpoint | Purpose |
|----------|---------|
| `GET /.well-known/oauth-protected-resource[/api/mcp]` | `resource` = `<origin>/api/mcp`, `authorization_servers` = this origin, `scopes_supported` = `["mcp"]`. |
| `GET /.well-known/oauth-authorization-server` | Advertises the endpoints below plus `code_challenge_methods_supported: ["S256"]` and `client_id_metadata_document_supported: true`. |
| `POST /api/oauth/register` | Dynamic Client Registration — `application/json`, send `redirect_uris` (`https://…` or loopback) + optional `client_name`. |
| `GET /oauth/authorize` | Browser-facing consent screen (requires a SharkShell session). Accepts `resource` and `scope`. |
| `POST /api/oauth/token` | `application/x-www-form-urlencoded`; `grant_type=authorization_code` (with `code_verifier`, `resource`) or `grant_type=refresh_token`. Errors use RFC 6749 codes (`invalid_grant`, `invalid_target`, …). |

- **Client ID Metadata Documents:** a `client_id` that is an `https://` URL is fetched (with an SSRF guard, size cap, and short-TTL cache), its `client_id` must equal the URL, and its `redirect_uris` are used directly — no registration call.
- **Loopback redirect URIs** (`http://localhost` / `127.0.0.1` / `[::1]`) match with the port ignored (RFC 8252 §7.3); everything else must match exactly.
- **Resource indicators:** when a `resource` parameter is present it must equal `<origin>/api/mcp` or the request is rejected `invalid_target`. Issued tokens are audience-bound to that resource.

## 5. JSON-RPC reference

Supported methods: `initialize`, `ping`, `tools/list`, `tools/call`. `initialize` negotiates the
protocol version (echoes the client's when supported, else returns `2025-11-25`) and returns
`serverInfo` + `instructions`. Notifications (no `id`, e.g. `notifications/initialized`) return
`202` with no body. JSON-RPC batching (arrays) is accepted for older clients but is no longer part
of the spec. Tool input-validation failures come back as tool results with `isError: true` (so the
model can self-correct), not as JSON-RPC protocol errors. Auth failures return HTTP `401` with a
JSON-RPC error (`code: -32001`) and `WWW-Authenticate: Bearer resource_metadata="…", scope="mcp", error="invalid_token"`.
