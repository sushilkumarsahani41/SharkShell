# SharkShell Backups

SharkShell can back up its database and encryption secrets on a schedule (or on demand) to a
destination of your choice: local disk, Amazon S3 / any S3-compatible object store, Google
Cloud Storage, SFTP, FTP, or WebDAV. Configure it in **Settings → Backup** (admin only).

Uploads go through [rclone](https://rclone.org/), bundled into the Docker image.

---

## 1. What's in a backup

Each backup is a single file: `sharkshell-backup-<timestamp>.sshell` (a `.tar.gz`, AES-256-CBC
encrypted with `openssl`, under a SharkShell-specific extension), containing:

- `database.sql` — a full `pg_dump` of the SharkShell database
- `secrets/` — `jwt_secret`, `encryption_key`, `db_password` from `/app/secrets`

The archive is encrypted at rest before it ever leaves the container — object storage
providers, SFTP servers, etc. only ever see ciphertext. By default the passphrase is your
instance's own `ENCRYPTION_KEY` (AES-256-CBC via `openssl`, PBKDF2-derived), but each
destination can set its own **backup password** instead — see below.

**Whichever key/password encrypted the archive is also the one needed to decrypt it.** Store
it somewhere separate from the backup destination — if you lose both, the backup is
unrecoverable. A password manager or a printed copy in a safe both work.

## 2. Adding a destination

Settings → Backup → **Add destination**. Fields differ by type:

| Type | Required fields |
|------|------------------|
| Local disk | none — stored in the `backups` Docker volume |
| S3 / S3-compatible | Access key ID, secret access key, bucket. Region and a custom endpoint are optional — set an endpoint for MinIO, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces, etc. |
| Google Cloud Storage | Bucket, and the full JSON key for a service account with `Storage Object Admin` on that bucket |
| SFTP | Host, port (default 22), username, password |
| FTP | Host, port (default 21), username, password, optional explicit TLS (FTPS) |
| WebDAV | Server URL, vendor (Nextcloud / ownCloud / Other), username, password |

All destination types except Local accept an optional **path/prefix** to keep backups under a
subfolder.

Credentials are AES-256-GCM encrypted at rest in the database and are never returned by the
API after saving — editing a destination shows blank credential fields; leave them blank to
keep the stored values, or fill them in to replace.

### Backup password (optional, any destination type)

Every destination can set its own **backup password**, used instead of the instance's raw
`ENCRYPTION_KEY` to encrypt that destination's archives. It's stored encrypted at rest, so
scheduled/automatic backups keep running unattended — you only need to type it again when
restoring somewhere else. This is the recommended way to prepare for migration: a password
you chose and can remember or share, instead of digging the raw master key out of the server
via `docker exec`.

## 3. Scheduling

Toggle **Run automatically on a schedule** and enter a standard 5-field cron expression (a
few common presets are one click away). Schedule checks run every minute; a destination fires
the first time the current minute is at or after its next scheduled occurrence since its last
run, so scheduling is minute-granular — fine for backups, not for sub-minute jobs.

**Retention** keeps the last N successful backups per destination (default 7) — older ones
are deleted automatically, including from remote storage.

## 4. Downloading & restoring

Backups sent to **Local disk** can be downloaded, or restored in-app, from the backup history
table. Remote destinations (S3, GCS, SFTP, FTP, WebDAV) support neither — pull the file from
the destination directly (e.g. the S3 console, an SFTP client), then use the manual procedure
below.

### In-app restore (Local disk backups, same instance)

Click **Restore** next to a successful local backup and type `RESTORE` to confirm — this is
gated behind a typed confirmation because the action is irreversible. It:

1. Decrypts the archive with the instance's current `ENCRYPTION_KEY`
2. Drops and reloads the database from the backup's `database.sql`
3. Restores `encryption_key` from the backup (so data encrypted under an older key stays
   readable) — `jwt_secret` and `db_password` are deliberately left untouched, since changing
   those would invalidate the live session doing the restore and break the live database
   connection's own credentials, respectively
4. Restarts the SharkShell process so the restored key is loaded from disk

The page shows a "Restoring…" state and reloads automatically once the service is back — this
usually takes a few seconds.

This only works on a **Local disk** destination (the file has to already be on this
filesystem) and only for a backup that this instance can still decrypt on its own — i.e. the
source destination didn't set a backup password, and this instance's `ENCRYPTION_KEY` hasn't
changed since. Restore auto-detects and uses the destination's backup password if it has one,
so this path needs no extra input from you either way.

### Restore from an uploaded file (moving a backup between instances)

Under **Restore from an uploaded file**, upload a `.sshell` file you downloaded from another
SharkShell instance's backup history and type `RESTORE` to confirm. It runs the exact same
decrypt/reload pipeline as above, just against an uploaded file instead of a local run.

By default this still requires the **target** instance's current `ENCRYPTION_KEY` to match the
one that encrypted the archive. To migrate a backup encrypted under something else — a
destination's backup password, or a different instance's raw key — check **This backup is
from a different SharkShell instance** and provide it:

- **If the source destination had a backup password set** (Settings → Backup → that
  destination → Edit), just enter that password. This is the easiest path and the reason to
  set one in the first place.
- **Otherwise**, retrieve the source instance's raw key instead:
  ```bash
  docker exec sharkshell cat /app/secrets/encryption_key
  ```

Either way, the value is used only to decrypt the uploaded archive. Once the restore succeeds,
the archive's own embedded `encryption_key` becomes this instance's new key automatically —
same as any other restore — so you don't need to touch the target's secrets yourself.

The raw instance key is the same master key protecting every stored SSH credential and host
password on the source instance, so treat it accordingly if you do end up using it: paste it
directly into the field, don't leave it sitting in a chat log or unencrypted note longer than
necessary, and the resulting target
instance will hold a full decrypted copy of the source's data — including for a **test**
instance you don't intend to keep secured to the same standard as production.

For anything the in-app flows above don't cover — e.g. restoring straight onto disk without
going through the app at all — use the fully manual procedure:

```bash
# 1. Decrypt (needs the ENCRYPTION_KEY that was active when this backup was made)
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:KEY -in sharkshell-backup-2026-08-01.sshell -out backup.tar.gz
# ↑ set KEY first: export KEY=<your 64-char hex ENCRYPTION_KEY>

# 2. Extract
tar -xzf backup.tar.gz
# → database.sql, secrets/{jwt_secret,encryption_key,db_password}

# 3. Stop SharkShell
docker compose down

# 4. Restore secrets (only if restoring onto a fresh/different install)
docker run --rm -v sharkshell-secrets:/app/secrets -v "$PWD/secrets":/restore alpine \
  sh -c "cp /restore/* /app/secrets/ && chmod 600 /app/secrets/*"

# 5. Restore the database — start just the DB, then load the dump
docker compose up -d sharkshell   # let it boot Postgres, then stop the app process:
docker exec -it sharkshell sh -c "
  PGPASSWORD=\$DB_PASSWORD psql -h \$DB_HOST -p \$DB_PORT -U \$DB_USER -d \$DB_NAME \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
"
docker exec -i sharkshell sh -c 'PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME' < database.sql

# 6. Restart
docker compose restart sharkshell
```

Adjust step 5/6 for an external (non-embedded) database — point `psql`/`pg_dump` at your own
host instead of the container's internal Postgres.

## 5. Environment notes

- Requires `pg_dump`, `tar`, and `openssl` (all present in the official image) plus `rclone`
  for any non-local destination. If you're running the backend outside Docker, install these
  yourself — `Settings → Backup` shows a warning if `rclone` isn't found.
- The `backups` Docker volume (`sharkshell-backups`) only holds Local-disk backups. It isn't
  needed if every destination is remote.
