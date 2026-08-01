# SharkShell Backups

SharkShell can back up its database and encryption secrets on a schedule (or on demand) to a
destination of your choice: local disk, Amazon S3 / any S3-compatible object store, Google
Cloud Storage, SFTP, FTP, or WebDAV. Configure it in **Settings → Backup** (admin only).

Uploads go through [rclone](https://rclone.org/), bundled into the Docker image.

---

## 1. What's in a backup

Each backup is a single file: `sharkshell-backup-<timestamp>.tar.gz.enc`, containing:

- `database.sql` — a full `pg_dump` of the SharkShell database
- `secrets/` — `jwt_secret`, `encryption_key`, `db_password` from `/app/secrets`

The archive is encrypted at rest with your instance's `ENCRYPTION_KEY` (AES-256-CBC via
`openssl`, PBKDF2-derived) before it ever leaves the container — object storage providers,
SFTP servers, etc. only ever see ciphertext.

**The `encryption_key` inside the backup is the same key needed to decrypt the backup
itself.** Store it somewhere separate from the backup destination — if you lose both, the
backup is unrecoverable. A password manager or a printed copy in a safe both work.

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

## 3. Scheduling

Toggle **Run automatically on a schedule** and enter a standard 5-field cron expression (a
few common presets are one click away). Schedule checks run every minute; a destination fires
the first time the current minute is at or after its next scheduled occurrence since its last
run, so scheduling is minute-granular — fine for backups, not for sub-minute jobs.

**Retention** keeps the last N successful backups per destination (default 7) — older ones
are deleted automatically, including from remote storage.

## 4. Downloading & restoring

Backups sent to **Local disk** can be downloaded from the backup history table. Remote
destinations (S3, GCS, SFTP, FTP, WebDAV) are not downloadable through the UI — pull the file
from the destination directly (e.g. the S3 console, an SFTP client).

There is intentionally **no one-click "restore" button** — restoring overwrites the live
database and secrets, and that's not something to trigger by accident from a settings page.
Restore manually:

```bash
# 1. Decrypt (needs the ENCRYPTION_KEY that was active when this backup was made)
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:KEY -in sharkshell-backup-2026-08-01.tar.gz.enc -out backup.tar.gz
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
