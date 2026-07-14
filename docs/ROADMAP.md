# SharkShell Roadmap — Multi-User, Sharing & Terminal Restore

Planning document for the next block of work. Nothing here is built yet except where marked **DONE**. Decisions captured from product discussion on 2026-07-10.

---

## Locked decisions

| Topic | Decision |
|-------|----------|
| **MCP placement** | MCP gets its own top-level nav section; **Settings** stays as a separate section for account/org. **(DONE — committed `f0acced`)** |
| **Sharing model** | **Both**: (1) shared access to resources via explicit sharing, and (2) live collaborative terminals. Build the sharing/vault foundation first; live collaboration is a later, larger phase. |
| **Resource visibility** | **Per-user private + explicit sharing.** A resource (host / key / group) is private to its creator until explicitly shared with specific users. Not org-wide-by-default. |
| **User onboarding** | **Both, sequenced.** Ship **admin-created accounts** first (zero config, no email server). Add **email invite links** afterward (needs SMTP). |
| **Terminal restore** | **Visual scrollback restore** (VSCode-style) — repaint prior output on reconnect. Client-side; remote shell restarts fresh underneath. True live-session persistence is deferred and folded into the collaborative-terminal phase. |

---

## Current architecture (starting point)

- **Auth:** single-user JWT (`id`, `email`, `name`). First-run creates one admin; registration locks afterward.
- **Data ownership:** every resource (`hosts`, `ssh_keys`, `groups`, `mcp_tokens`) is scoped by a flat `user_id`. Controllers query `WHERE user_id = $me`.
- **Terminals:** live xterm + SSH socket held in-memory (`sessionRefs`); only session *metadata* is persisted to `localStorage`. Reconnect = new xterm + new SSH PTY + `term.clear()` → all prior output lost.
- **SSH gateway:** one SSH client bound to one socket.io connection; torn down on disconnect.

---

## Phase 0 — MCP section split ✅ DONE (committed `f0acced`)

- New `MCP` nav item + `/dashboard/mcp` route; MCP UI moved to `McpPage.jsx`.
- `SettingsPage.jsx` repurposed as a real account section (name, email, member-since) — the shell that org settings will extend.
- No backend change. Builds clean.

**Remaining:** shipped in the v2.0.0 release alongside Phases 1–2.

---

## Phase 1 — Terminal visual scrollback restore ✅ DONE

**Independent of all org work. Highest daily-use value, lowest risk — shipped first (v2.0.0).**

- `@xterm/addon-serialize` added; a `SerializeAddon` is attached per session.
- Serialized buffer persisted per session in localStorage (`sharkshell_scrollback_<sessionId>`, last 1000 lines, 256 KB cap keeping the tail; orphaned buffers pruned on load; migrate to IndexedDB if size becomes a problem).
- Save triggers: disconnect events (`ssh:closed`/`ssh:error`/`connect_error`), a 15 s periodic timer, `beforeunload` (covers page reload), and just before an in-page reconnect disposes the old term.
- On reconnect: saved buffer repainted, `── history restored ──` divider drawn, then connect. `term.clear()` on `ssh:connected` is skipped when history was restored.
- Saved buffer cleared on explicit close / workspace delete.

**Scope:** frontend only (`TerminalContext.jsx`). No API/DB change.
**Verification:** connect → run commands → drop socket / reload → reconnect shows prior output above a fresh shell.

---

## Phase 2 — Organization foundation & admin onboarding ✅ DONE

Turned SharkShell from single-user into a multi-user org with an admin. Shipped alongside SMTP settings + forgot-password (pulled forward from Phase 4 groundwork).

### Data model (implemented)
- `organizations` (`id`, `name`, `owner_user_id`, `created_at`).
- `users`: added `org_id` (FK), `role` (`admin` | `member`), `is_active`, `must_change_password`. Backfill: existing solo user becomes the admin/owner of a new org (in-place, idempotent — verified against a simulated v1.4.1 DB).
- `password_resets` (hashed one-time tokens, 1 h expiry) and `app_settings` (AES-256-GCM encrypted JSON values; holds SMTP config).
- JWT payload gains `org_id` and `role`.

### Backend (implemented)
- `AuthGuard` additionally rejects deactivated accounts (DB check); new `AdminGuard` reads role fresh from the DB. SSH gateway also blocks deactivated users.
- Admin user management: `GET/POST/PATCH/DELETE /api/org/users` (create with temp password, set role, activate/deactivate, reset temp password) with self-modification and last-admin guard rails; `GET/PATCH /api/org` (name). All scoped to the caller's `org_id`.
- First-run registration creates org + admin together.
- SMTP: `GET/PUT /api/org/smtp` (password write-only), `POST /api/org/smtp/test`; `MailService` on nodemailer.
- Forgot password: public `POST /api/auth/forgot-password` (503 when SMTP unconfigured; identical response whether or not the account exists) + `POST /api/auth/reset-password`; `POST /api/auth/change-password` for logged-in users.
- **TOTP 2FA** (otplib v13 + qrcode): per-user opt-in via `/api/auth/2fa/setup|enable|disable`; secret AES-256-GCM encrypted, 10 single-use recovery codes stored as SHA-256 hashes. Login becomes two-step (`requires2fa` + 5-min pending token redeemed at `/api/auth/2fa/verify`); pending tokens are rejected by AuthGuard/AdminGuard/SSH gateway. 5-failure lockout (5 min). Admin can `reset_2fa` for a member who lost their device.

### Frontend (implemented)
- **Settings** now tabbed: Account (profile + change password + 2FA enrollment with QR / recovery codes), **Organization** (admin: rename, member table, add-member modal with generated temp password shown once, role/deactivate/reset-pw/reset-2FA/delete) and **Email (SMTP)** (admin: config form + send-test-email).
- Force-password-change screen replaces the dashboard until admin-created accounts set their own password.
- Login page gained "Forgot password?"; new `/forgot-password` and `/reset-password` routes.

**Resolved open question:** admin manages users only — no override into members' private resources (sharing comes in Phase 3).

---

## Phase 3 — Explicit resource sharing

Implements "per-user private + explicit sharing" on top of Phase 2.

### Data model
- `resource_shares` (`id`, `resource_type` [`host`|`key`|`group`], `resource_id`, `owner_user_id`, `shared_with_user_id`, `permission` [`use`|`manage`], `created_at`). Generic table over per-type tables for simplicity.

### Access resolution (the core change)
- Every resource query changes from `WHERE user_id = $me` to *owned OR shared-with-me*.
- Permissions: **host** — `use` = connect, `manage` = edit/delete; **key** — `use` = connect *through* it (the private key is **never** exposed to the sharee; the SSH proxy uses it server-side), `manage` = edit/delete; **group** — sharing a group offers its members.
- MCP key scoping (Phase 1.4.1) must respect sharing: a user's MCP key can only reach hosts they own or are shared.

### Frontend
- "Share" affordance on host/key/group cards → pick org members + permission.
- Visual marker for shared-in vs owned resources; show owner.

**Effort:** medium-large (every controller + the sharing UI). **Risk:** access-control correctness — needs a denial-path test suite like the MCP scoping work (owner sees, sharee with `use` can connect but not delete, non-sharee denied).

---

## Phase 4 — Email invites (enhancement)

- `invites` (`id`, `org_id`, `email`, `token_hash`, `role`, `expires_at`, `accepted_at`).
- `POST /api/org/invites` (admin) → email a signed link; public `POST /api/org/invites/:token/accept` sets password and joins the org.
- **SMTP transport already exists** (Phase 2 shipped admin-configurable SMTP settings + `MailService`); degrade gracefully to admin-created accounts when unconfigured.

**Effort:** small (transport + settings UI already built).

---

## Phase 5 — Live collaborative terminals

The largest phase. Also delivers **true live-session persistence** as a byproduct.

### Server-side session registry (decouple SSH from socket)
- SSH PTYs live in a server-side registry keyed by a session id, **independent** of any one socket.io connection; each keeps a rolling output ring-buffer.
- Re-attach: a reconnecting (or newly joining) client replays the ring-buffer, then streams live — this is what makes a running `top` survive a tab reload *and* lets a second user join.
- Lifecycle: idle timeout, max buffer, explicit termination, cleanup on org/user delete.

### Collaboration layer
- Share a live session with org members (`use` = read-write, `view` = read-only); presence indicators; an input-ownership / soft-lock model to avoid keystroke collisions.
- Builds on Phase 3 sharing semantics.

**Effort:** large. **Risks:** real-time correctness, memory management on the server, auth on re-attach, security of multi-writer input. Prototype the registry + single-user re-attach (true persistence) before adding multi-user.

---

## Recommended sequencing

1. **Phase 1** — terminal visual restore (quick, independent, high value). Ship as a point release.
2. **Phase 2** — org foundation + admin-created accounts.
3. **Phase 3** — explicit sharing (the heart of the multi-user value).
4. **Phase 4** — email invites (when an email transport is chosen).
5. **Phase 5** — live collaborative terminals + true session persistence.

Each phase is independently shippable behind a version bump. Phases 2–3 are the multi-tenant core and should be tested against an existing single-user database with denial-path suites before release.

---

## Cross-cutting concerns

- **Migrations:** in-place, idempotent, tested against a pre-existing single-user DB (the v1.4.1 `mcp_tokens` migration is the reference pattern).
- **Security:** access control enforced **server-side** on every query; private key material never leaves the server even when a key is shared; denial-path tests are mandatory for Phases 2, 3, 5.
- **Encryption:** shared keys/passwords stay AES-256-GCM at rest; sharing grants *use via the proxy*, not plaintext access.
- **Backward compatibility:** a fresh single-user install must keep working with zero configuration; org features are additive.
