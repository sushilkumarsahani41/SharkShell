import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Client, SFTPWrapper } from 'ssh2';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // close SFTP sessions unused for 15 minutes
const SWEEP_INTERVAL_MS = 60 * 1000;

interface SftpSession {
    id: string;
    userId: string;
    hostId: string;
    hostName: string;
    client: Client;
    sftp: SFTPWrapper;
    lastUsedAt: number;
}

export interface FileEntry {
    name: string;
    type: 'file' | 'directory' | 'symlink' | 'other';
    size: number;
    mtime: number;
    mode: number;
}

@Injectable()
export class SftpService implements OnModuleDestroy {
    private readonly logger = new Logger(SftpService.name);
    private sessions = new Map<string, SftpSession>();
    private sweepTimer: NodeJS.Timeout;

    constructor(
        private db: DatabaseService,
        private crypto: CryptoService,
    ) {
        this.sweepTimer = setInterval(() => this.sweepIdleSessions(), SWEEP_INTERVAL_MS);
    }

    onModuleDestroy() {
        clearInterval(this.sweepTimer);
        for (const session of this.sessions.values()) session.client.end();
    }

    private sweepIdleSessions() {
        const now = Date.now();
        for (const [id, session] of this.sessions.entries()) {
            if (now - session.lastUsedAt > IDLE_TIMEOUT_MS) {
                this.logger.log(`Closing idle SFTP session ${id} (host: ${session.hostName})`);
                session.client.end();
                this.sessions.delete(id);
            }
        }
    }

    // ─── Session lifecycle ───

    async openSession(userId: string, hostId: string, opts: { password?: string; passphrase?: string } = {}): Promise<{ id: string; hostName: string }> {
        const hostResult = await this.db.query('SELECT * FROM hosts WHERE id = $1 AND user_id = $2', [hostId, userId]);
        if (hostResult.rows.length === 0) throw new Error('Host not found');
        const host = hostResult.rows[0];

        const connConfig: any = {
            host: host.hostname,
            port: host.port || 22,
            username: host.username,
            readyTimeout: 20000,
            keepaliveInterval: 10000,
        };

        if (host.auth_type === 'key') {
            if (!host.ssh_key_id) throw new Error('No SSH key assigned to this host. Edit the host and select a key.');
            const keyResult = await this.db.query('SELECT * FROM ssh_keys WHERE id = $1 AND user_id = $2', [host.ssh_key_id, userId]);
            if (keyResult.rows.length === 0) throw new Error('The SSH key assigned to this host no longer exists. Edit the host and select a valid key.');
            const key = keyResult.rows[0];
            connConfig.privateKey = this.crypto.decrypt(key.private_key_encrypted, key.iv, key.auth_tag);
            if (opts.passphrase) {
                connConfig.passphrase = opts.passphrase;
            } else if (key.passphrase_encrypted && key.passphrase_iv && key.passphrase_auth_tag) {
                connConfig.passphrase = this.crypto.decrypt(key.passphrase_encrypted, key.passphrase_iv, key.passphrase_auth_tag);
            }
        } else if (host.auth_type === 'password') {
            if (opts.password) {
                connConfig.password = opts.password;
            } else if (host.password_encrypted && host.password_iv && host.password_auth_tag) {
                connConfig.password = this.crypto.decrypt(host.password_encrypted, host.password_iv, host.password_auth_tag);
            }
        }

        const client = new Client();
        const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
            client.on('ready', () => {
                client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
            });
            client.on('error', (err) => reject(err));
            client.connect(connConfig);
        });

        const id = randomUUID();
        this.sessions.set(id, { id, userId, hostId, hostName: host.name, client, sftp, lastUsedAt: Date.now() });
        client.on('close', () => this.sessions.delete(id));
        return { id, hostName: host.name };
    }

    closeSession(userId: string, sessionId: string) {
        const session = this.getSession(userId, sessionId);
        session.client.end();
        this.sessions.delete(sessionId);
    }

    listSessions(userId: string) {
        return [...this.sessions.values()]
            .filter((s) => s.userId === userId)
            .map((s) => ({ id: s.id, hostId: s.hostId, hostName: s.hostName }));
    }

    private getSession(userId: string, sessionId: string): SftpSession {
        const session = this.sessions.get(sessionId);
        if (!session || session.userId !== userId) throw new Error('SFTP session not found or expired — reconnect to this host');
        session.lastUsedAt = Date.now();
        return session;
    }

    // Exposed so the controller can pipe streams directly without re-deriving the session.
    getSftp(userId: string, sessionId: string): SFTPWrapper {
        return this.getSession(userId, sessionId).sftp;
    }

    // ─── File operations ───

    async list(userId: string, sessionId: string, remotePath: string): Promise<FileEntry[]> {
        const sftp = this.getSession(userId, sessionId).sftp;
        return new Promise((resolve, reject) => {
            sftp.readdir(remotePath, (err, list) => {
                if (err) return reject(new Error(this.friendlyError(err, remotePath)));
                resolve(
                    list
                        .map((entry) => ({
                            name: entry.filename,
                            type: this.entryType(entry.attrs.mode),
                            size: entry.attrs.size,
                            mtime: entry.attrs.mtime * 1000,
                            mode: entry.attrs.mode,
                        }))
                        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1)),
                );
            });
        });
    }

    private entryType(mode: number): FileEntry['type'] {
        if ((mode & 0o170000) === 0o040000) return 'directory';
        if ((mode & 0o170000) === 0o120000) return 'symlink';
        if ((mode & 0o170000) === 0o100000) return 'file';
        return 'other';
    }

    private friendlyError(err: any, path?: string): string {
        const code = err?.code;
        if (code === 2 || /no such file/i.test(err?.message || '')) return `Not found: ${path || ''}`;
        if (code === 3 || /permission denied/i.test(err?.message || '')) return `Permission denied: ${path || ''}`;
        return err?.message || String(err);
    }

    async mkdir(userId: string, sessionId: string, remotePath: string): Promise<void> {
        const sftp = this.getSession(userId, sessionId).sftp;
        return new Promise((resolve, reject) => {
            sftp.mkdir(remotePath, (err) => (err ? reject(new Error(this.friendlyError(err, remotePath))) : resolve()));
        });
    }

    async rename(userId: string, sessionId: string, from: string, to: string): Promise<void> {
        const sftp = this.getSession(userId, sessionId).sftp;
        return new Promise((resolve, reject) => {
            sftp.rename(from, to, (err) => (err ? reject(new Error(this.friendlyError(err, from))) : resolve()));
        });
    }

    async deleteFile(userId: string, sessionId: string, remotePath: string): Promise<void> {
        const sftp = this.getSession(userId, sessionId).sftp;
        return new Promise((resolve, reject) => {
            sftp.unlink(remotePath, (err) => (err ? reject(new Error(this.friendlyError(err, remotePath))) : resolve()));
        });
    }

    async deleteDir(userId: string, sessionId: string, remotePath: string): Promise<void> {
        const sftp = this.getSession(userId, sessionId).sftp;
        return new Promise((resolve, reject) => {
            sftp.rmdir(remotePath, (err) => (err ? reject(new Error(this.friendlyError(err, remotePath))) : resolve()));
        });
    }

    async stat(userId: string, sessionId: string, remotePath: string): Promise<FileEntry> {
        const sftp = this.getSession(userId, sessionId).sftp;
        return new Promise((resolve, reject) => {
            sftp.stat(remotePath, (err, stats) => {
                if (err) return reject(new Error(this.friendlyError(err, remotePath)));
                resolve({
                    name: remotePath.split('/').pop() || remotePath,
                    type: this.entryType(stats.mode),
                    size: stats.size,
                    mtime: stats.mtime * 1000,
                    mode: stats.mode,
                });
            });
        });
    }

    // Server-side host-to-host transfer — streams directly between two open SFTP
    // connections without ever buffering through the browser or this server's disk.
    async transfer(userId: string, sourceSessionId: string, sourcePath: string, destSessionId: string, destPath: string): Promise<void> {
        const sourceSftp = this.getSession(userId, sourceSessionId).sftp;
        const destSftp = this.getSession(userId, destSessionId).sftp;
        return new Promise((resolve, reject) => {
            const readStream = sourceSftp.createReadStream(sourcePath);
            const writeStream = destSftp.createWriteStream(destPath);
            readStream.on('error', (err) => reject(new Error(this.friendlyError(err, sourcePath))));
            writeStream.on('error', (err) => reject(new Error(this.friendlyError(err, destPath))));
            writeStream.on('close', () => resolve());
            readStream.pipe(writeStream);
        });
    }
}
