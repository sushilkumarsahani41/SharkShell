import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as parser from 'cron-parser';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';
import { RcloneService, DestinationConfig, BackupDestinationType } from './rclone.service';

const LOCAL_BACKUP_DIR = '/app/backups';
const SECRETS_DIR = '/app/secrets';
const DESTINATION_TYPES: BackupDestinationType[] = ['local', 's3', 'gcs', 'sftp', 'ftp', 'webdav'];

@Injectable()
export class BackupService implements OnModuleInit {
    private readonly logger = new Logger(BackupService.name);
    private running = new Set<string>();

    constructor(
        private db: DatabaseService,
        private crypto: CryptoService,
        private rclone: RcloneService,
    ) { }

    async onModuleInit() {
        try { await fsp.mkdir(LOCAL_BACKUP_DIR, { recursive: true }); } catch { }
    }

    // ─── Destination CRUD ───

    async listDestinations(orgId: string) {
        const result = await this.db.query(
            `SELECT id, name, type, cron_expression, schedule_enabled, retention_count, is_active, last_run_at, created_at
             FROM backup_destinations WHERE org_id = $1 ORDER BY created_at DESC`,
            [orgId],
        );
        return result.rows;
    }

    async createDestination(orgId: string, userId: string, data: {
        name: string; type: BackupDestinationType; config: DestinationConfig;
        cronExpression?: string; scheduleEnabled?: boolean; retentionCount?: number;
    }) {
        if (!data.name?.trim()) throw new Error('Name is required');
        if (!DESTINATION_TYPES.includes(data.type)) throw new Error('Invalid destination type');
        if (data.scheduleEnabled) {
            if (!data.cronExpression) throw new Error('Cron expression is required when scheduling is enabled');
            this.validateCron(data.cronExpression);
        }

        const { encrypted, iv, authTag } = this.crypto.encrypt(JSON.stringify(data.config || {}));
        const result = await this.db.query(
            `INSERT INTO backup_destinations
                (org_id, name, type, config_encrypted, config_iv, config_auth_tag, cron_expression, schedule_enabled, retention_count, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING id, name, type, cron_expression, schedule_enabled, retention_count, is_active, created_at`,
            [orgId, data.name.trim(), data.type, encrypted, iv, authTag,
                data.cronExpression || null, !!data.scheduleEnabled, data.retentionCount ?? 7, userId],
        );
        return result.rows[0];
    }

    async updateDestination(orgId: string, id: string, data: Partial<{
        name: string; config: DestinationConfig; cronExpression: string | null;
        scheduleEnabled: boolean; retentionCount: number; isActive: boolean;
    }>) {
        const existing = await this.getDestinationRaw(orgId, id);
        if (!existing) throw new Error('Destination not found');

        const willBeScheduled = data.scheduleEnabled ?? existing.schedule_enabled;
        const effectiveCron = data.cronExpression !== undefined ? data.cronExpression : existing.cron_expression;
        if (willBeScheduled) {
            if (!effectiveCron) throw new Error('Cron expression is required when scheduling is enabled');
            this.validateCron(effectiveCron);
        }

        const sets: string[] = [];
        const params: any[] = [];
        let i = 1;
        if (data.name !== undefined) { sets.push(`name = $${i++}`); params.push(data.name.trim()); }
        if (data.config !== undefined) {
            const { encrypted, iv, authTag } = this.crypto.encrypt(JSON.stringify(data.config));
            sets.push(`config_encrypted = $${i++}`); params.push(encrypted);
            sets.push(`config_iv = $${i++}`); params.push(iv);
            sets.push(`config_auth_tag = $${i++}`); params.push(authTag);
        }
        if (data.cronExpression !== undefined) { sets.push(`cron_expression = $${i++}`); params.push(data.cronExpression); }
        if (data.scheduleEnabled !== undefined) { sets.push(`schedule_enabled = $${i++}`); params.push(data.scheduleEnabled); }
        if (data.retentionCount !== undefined) { sets.push(`retention_count = $${i++}`); params.push(data.retentionCount); }
        if (data.isActive !== undefined) { sets.push(`is_active = $${i++}`); params.push(data.isActive); }
        if (sets.length === 0) return this.toPublic(existing);
        sets.push('updated_at = NOW()');

        params.push(orgId, id);
        const result = await this.db.query(
            `UPDATE backup_destinations SET ${sets.join(', ')} WHERE org_id = $${i++} AND id = $${i}
             RETURNING id, name, type, cron_expression, schedule_enabled, retention_count, is_active, created_at`,
            params,
        );
        return result.rows[0];
    }

    async deleteDestination(orgId: string, id: string) {
        await this.db.query('DELETE FROM backup_destinations WHERE org_id = $1 AND id = $2', [orgId, id]);
    }

    private toPublic(row: any) {
        const { config_encrypted, config_iv, config_auth_tag, ...rest } = row;
        return rest;
    }

    private async getDestinationRaw(orgId: string, id: string) {
        const result = await this.db.query('SELECT * FROM backup_destinations WHERE org_id = $1 AND id = $2', [orgId, id]);
        return result.rows[0] || null;
    }

    private decryptConfig(row: any): DestinationConfig {
        if (!row.config_encrypted) return {};
        return JSON.parse(this.crypto.decrypt(row.config_encrypted, row.config_iv, row.config_auth_tag));
    }

    private validateCron(expr: string) {
        try {
            parser.parseExpression(expr);
        } catch {
            throw new Error('Invalid cron expression');
        }
    }

    // ─── Run history ───

    async listRuns(orgId: string, destinationId?: string) {
        const params: any[] = [orgId];
        let where = 'd.org_id = $1';
        if (destinationId) { params.push(destinationId); where += ` AND r.destination_id = $${params.length}`; }
        const result = await this.db.query(
            `SELECT r.id, r.destination_id, d.name as destination_name, d.type as destination_type,
                    r.status, r.triggered_by, r.size_bytes, r.file_name, r.error, r.started_at, r.finished_at
             FROM backup_runs r JOIN backup_destinations d ON d.id = r.destination_id
             WHERE ${where} ORDER BY r.started_at DESC LIMIT 100`,
            params,
        );
        return result.rows;
    }

    async getLocalBackupPath(orgId: string, runId: string): Promise<{ path: string; fileName: string } | null> {
        const result = await this.db.query(
            `SELECT r.local_path, r.file_name FROM backup_runs r
             JOIN backup_destinations d ON d.id = r.destination_id
             WHERE r.id = $1 AND d.org_id = $2 AND d.type = 'local' AND r.status = 'success'`,
            [runId, orgId],
        );
        const row = result.rows[0];
        if (!row || !row.local_path || !fs.existsSync(row.local_path)) return null;
        return { path: row.local_path, fileName: row.file_name };
    }

    // ─── Restore ───
    // Local backups only — a remote destination's file isn't on this filesystem to read back.
    // Overwrites the live database and the encryption_key secret, then exits the process so
    // Docker's restart policy brings the app back up with the restored key loaded from disk.
    // jwt_secret and db_password are deliberately NOT restored: jwt_secret only affects live
    // session validity (not data), and db_password must keep matching this Postgres role's
    // actual live password, which restoring an old backup's copy would break.

    async restoreLocalBackup(orgId: string, runId: string) {
        const result = await this.db.query(
            `SELECT r.local_path, r.file_name FROM backup_runs r
             JOIN backup_destinations d ON d.id = r.destination_id
             WHERE r.id = $1 AND d.org_id = $2 AND d.type = 'local' AND r.status = 'success'`,
            [runId, orgId],
        );
        const row = result.rows[0];
        if (!row || !row.local_path || !fs.existsSync(row.local_path)) {
            throw new Error('Backup file not found — only local backups can be restored here');
        }
        return this.restoreFromFile(row.local_path, `run ${runId}`);
    }

    // Restores from an arbitrary encrypted archive already on disk — used both for a known
    // local run (above) and for a file the admin uploaded from another instance's backup.
    // Cross-instance restore only works if the archive was encrypted with THIS instance's
    // current ENCRYPTION_KEY; otherwise decryption fails with a clear error below.
    async restoreFromFile(filePath: string, sourceLabel: string) {
        const stagingDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sharkshell-restore-'));
        try {
            const archivePath = path.join(stagingDir, 'archive.tar.gz');
            await this.decryptFile(filePath, archivePath);
            await this.untar(archivePath, stagingDir);

            const dumpPath = path.join(stagingDir, 'database.sql');
            if (!fs.existsSync(dumpPath)) {
                throw new Error('Backup archive is missing database.sql — it may be corrupt');
            }

            const encKeyPath = path.join(stagingDir, 'secrets', 'encryption_key');
            const newEncryptionKey = fs.existsSync(encKeyPath)
                ? (await fsp.readFile(encKeyPath, 'utf8')).trim()
                : null;

            await this.pgRestore(dumpPath);

            if (newEncryptionKey) {
                await fsp.writeFile(path.join(SECRETS_DIR, 'encryption_key'), newEncryptionKey, { mode: 0o600 });
            }

            this.logger.warn(`Restore completed from ${sourceLabel} — restarting process to load restored state.`);
            setTimeout(() => process.exit(0), 1000);
            return { message: 'Restore complete. The service is restarting to apply the restored data.' };
        } finally {
            await fsp.rm(stagingDir, { recursive: true, force: true });
        }
    }

    private decryptFile(inPath: string, outPath: string): Promise<void> {
        const key = process.env.ENCRYPTION_KEY;
        if (!key || key.length !== 64) return Promise.reject(new Error('ENCRYPTION_KEY missing/invalid'));
        return new Promise((resolve, reject) => {
            const proc = spawn('openssl', [
                'enc', '-d', '-aes-256-cbc', '-pbkdf2',
                '-pass', 'env:SHARKSHELL_BACKUP_KEY',
                '-in', inPath, '-out', outPath,
            ], { env: { ...process.env, SHARKSHELL_BACKUP_KEY: key } });
            let stderr = '';
            proc.stderr.on('data', (d) => (stderr += d.toString()));
            proc.on('error', (err) => reject(new Error(`Failed to spawn openssl: ${err.message}`)));
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Decryption failed (code ${code}) — wrong ENCRYPTION_KEY for this backup? ${stderr.trim().slice(-500)}`));
            });
        });
    }

    private untar(archivePath: string, destDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = spawn('tar', ['-xzf', archivePath, '-C', destDir]);
            let stderr = '';
            proc.stderr.on('data', (d) => (stderr += d.toString()));
            proc.on('error', (err) => reject(new Error(`Failed to spawn tar: ${err.message}`)));
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`tar extraction failed (code ${code}): ${stderr.trim().slice(-500)}`));
            });
        });
    }

    private pgRestore(dumpPath: string): Promise<void> {
        const pgEnv = {
            ...process.env,
            PGPASSWORD: process.env.DB_PASSWORD || '',
        };
        const pgArgs = [
            '-h', process.env.DB_HOST || 'localhost',
            '-p', process.env.DB_PORT || '5432',
            '-U', process.env.DB_USER || 'sharkshell',
            '-d', process.env.DB_NAME || 'sharkshell',
        ];

        const dropResult = spawnSync('psql', [...pgArgs, '-v', 'ON_ERROR_STOP=1', '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'], { env: pgEnv });
        if (dropResult.status !== 0) {
            throw new Error(`Failed to reset database schema before restore: ${dropResult.stderr?.toString().slice(-1000)}`);
        }

        return new Promise((resolve, reject) => {
            const proc = spawn('psql', [...pgArgs, '-v', 'ON_ERROR_STOP=1'], { env: pgEnv });
            const dumpStream = fs.createReadStream(dumpPath);
            dumpStream.pipe(proc.stdin);
            let stderr = '';
            proc.stderr.on('data', (d) => (stderr += d.toString()));
            proc.on('error', (err) => reject(new Error(`Failed to spawn psql: ${err.message}`)));
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Database restore failed (code ${code}): ${stderr.trim().slice(-2000)}`));
            });
        });
    }

    // ─── Backup execution ───

    async triggerBackup(orgId: string, destinationId: string, triggeredBy: 'manual' | 'scheduled' = 'manual') {
        const dest = await this.getDestinationRaw(orgId, destinationId);
        if (!dest) throw new Error('Destination not found');
        if (this.running.has(destinationId)) throw new Error('A backup is already running for this destination');
        this.running.add(destinationId);
        try {
            return await this.runBackup(dest, triggeredBy);
        } finally {
            this.running.delete(destinationId);
        }
    }

    private async runBackup(dest: any, triggeredBy: string) {
        const startedAt = new Date();
        const runResult = await this.db.query(
            `INSERT INTO backup_runs (destination_id, status, triggered_by) VALUES ($1,'running',$2) RETURNING id`,
            [dest.id, triggeredBy],
        );
        const runId = runResult.rows[0].id;

        const timestamp = startedAt.toISOString().replace(/[:.]/g, '-');
        const fileName = `sharkshell-backup-${timestamp}.tar.gz.enc`;
        const stagingDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sharkshell-backup-'));

        try {
            const dumpPath = path.join(stagingDir, 'database.sql');
            await this.pgDump(dumpPath);

            const secretsStagingDir = path.join(stagingDir, 'secrets');
            await fsp.mkdir(secretsStagingDir, { recursive: true });
            for (const f of ['jwt_secret', 'encryption_key', 'db_password']) {
                const src = path.join(SECRETS_DIR, f);
                if (fs.existsSync(src)) await fsp.copyFile(src, path.join(secretsStagingDir, f));
            }

            const archivePath = path.join(stagingDir, 'archive.tar.gz');
            await this.tarGzip(stagingDir, ['database.sql', 'secrets'], archivePath);

            const encryptedPath = path.join(stagingDir, fileName);
            await this.encryptFile(archivePath, encryptedPath);
            const { size } = await fsp.stat(encryptedPath);

            let localPath: string | null = null;
            if (dest.type === 'local') {
                localPath = path.join(LOCAL_BACKUP_DIR, fileName);
                await fsp.copyFile(encryptedPath, localPath);
            } else {
                if (!this.rclone.isAvailable()) {
                    throw new Error('rclone is not installed in this container — remote backup destinations are unavailable');
                }
                const config = this.decryptConfig(dest);
                await this.rclone.copyTo(encryptedPath, dest.type, config, fileName);
            }

            await this.db.query(
                `UPDATE backup_runs SET status='success', size_bytes=$1, file_name=$2, local_path=$3, finished_at=NOW() WHERE id=$4`,
                [size, fileName, localPath, runId],
            );
            await this.db.query('UPDATE backup_destinations SET last_run_at = NOW() WHERE id = $1', [dest.id]);

            await this.enforceRetention(dest);
            return { id: runId, status: 'success', fileName, size };
        } catch (err: any) {
            this.logger.error(`Backup failed for destination ${dest.id}: ${err.message}`);
            await this.db.query(
                `UPDATE backup_runs SET status='failed', error=$1, finished_at=NOW() WHERE id=$2`,
                [String(err.message || err).slice(0, 2000), runId],
            );
            throw err;
        } finally {
            await fsp.rm(stagingDir, { recursive: true, force: true });
        }
    }

    private async enforceRetention(dest: any) {
        const retention = dest.retention_count || 7;
        const stale = await this.db.query(
            `SELECT id, file_name, local_path FROM backup_runs
             WHERE destination_id = $1 AND status = 'success' ORDER BY started_at DESC OFFSET $2`,
            [dest.id, retention],
        );
        for (const run of stale.rows) {
            try {
                if (dest.type === 'local') {
                    if (run.local_path) await fsp.unlink(run.local_path);
                } else if (run.file_name) {
                    const config = this.decryptConfig(dest);
                    await this.rclone.deleteFile(dest.type, config, run.file_name);
                }
            } catch (err: any) {
                this.logger.warn(`Retention cleanup failed for run ${run.id}: ${err.message}`);
            }
            await this.db.query('DELETE FROM backup_runs WHERE id = $1', [run.id]);
        }
    }

    private pgDump(outPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const out = fs.createWriteStream(outPath);
            const proc = spawn('pg_dump', [
                '-h', process.env.DB_HOST || 'localhost',
                '-p', process.env.DB_PORT || '5432',
                '-U', process.env.DB_USER || 'sharkshell',
                '-d', process.env.DB_NAME || 'sharkshell',
                '--no-owner', '--no-privileges',
            ], { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' } });
            let stderr = '';
            proc.stdout.pipe(out);
            proc.stderr.on('data', (d) => (stderr += d.toString()));
            proc.on('error', (err) => reject(new Error(`Failed to spawn pg_dump: ${err.message}`)));
            proc.on('close', (code) => {
                out.close();
                if (code === 0) resolve();
                else reject(new Error(`pg_dump exited with code ${code}: ${stderr.trim().slice(-2000)}`));
            });
        });
    }

    private tarGzip(cwd: string, entries: string[], outPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = spawn('tar', ['-czf', outPath, '-C', cwd, ...entries]);
            let stderr = '';
            proc.stderr.on('data', (d) => (stderr += d.toString()));
            proc.on('error', (err) => reject(new Error(`Failed to spawn tar: ${err.message}`)));
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`tar exited with code ${code}: ${stderr.trim().slice(-500)}`));
            });
        });
    }

    private encryptFile(inPath: string, outPath: string): Promise<void> {
        const key = process.env.ENCRYPTION_KEY;
        if (!key || key.length !== 64) return Promise.reject(new Error('ENCRYPTION_KEY missing/invalid'));
        return new Promise((resolve, reject) => {
            const proc = spawn('openssl', [
                'enc', '-aes-256-cbc', '-salt', '-pbkdf2',
                '-pass', 'env:SHARKSHELL_BACKUP_KEY',
                '-in', inPath, '-out', outPath,
            ], { env: { ...process.env, SHARKSHELL_BACKUP_KEY: key } });
            let stderr = '';
            proc.stderr.on('data', (d) => (stderr += d.toString()));
            proc.on('error', (err) => reject(new Error(`Failed to spawn openssl: ${err.message}`)));
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`openssl encryption failed (code ${code}): ${stderr.trim().slice(-500)}`));
            });
        });
    }

    // ─── Scheduler heartbeat ───
    // Checked every minute rather than registering dynamic per-destination cron
    // jobs — simpler to reason about and naturally survives restarts, at the
    // cost of minute-level scheduling granularity (fine for backups).

    @Cron(CronExpression.EVERY_MINUTE)
    async handleScheduledBackups() {
        let destinations: any[];
        try {
            const result = await this.db.query(
                `SELECT * FROM backup_destinations WHERE schedule_enabled = true AND is_active = true AND cron_expression IS NOT NULL`,
            );
            destinations = result.rows;
        } catch (err: any) {
            this.logger.error(`Failed to load scheduled destinations: ${err.message}`);
            return;
        }

        const now = new Date();
        for (const dest of destinations) {
            if (this.running.has(dest.id)) continue;
            try {
                const interval = parser.parseExpression(dest.cron_expression, { currentDate: now });
                const prevFire = interval.prev().toDate();
                const lastRun = dest.last_run_at ? new Date(dest.last_run_at) : null;
                const dueSinceLastRun = !lastRun || prevFire > lastRun;
                const withinWindow = now.getTime() - prevFire.getTime() < 60_000;
                if (dueSinceLastRun && withinWindow) {
                    this.running.add(dest.id);
                    this.runBackup(dest, 'scheduled')
                        .catch((err: any) => this.logger.error(`Scheduled backup failed for ${dest.name}: ${err.message}`))
                        .finally(() => this.running.delete(dest.id));
                }
            } catch (err: any) {
                this.logger.error(`Bad cron expression for destination ${dest.id}: ${err.message}`);
            }
        }
    }
}
