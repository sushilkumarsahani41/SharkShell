import { Injectable, Logger } from '@nestjs/common';
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type BackupDestinationType = 'local' | 's3' | 'gcs' | 'sftp' | 'ftp' | 'webdav';

export interface DestinationConfig {
    // s3
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    bucket?: string;
    endpoint?: string; // set for S3-compatible providers (MinIO, R2, B2, Wasabi, Spaces)
    // gcs
    serviceAccountJson?: string;
    // sftp / ftp / webdav
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    useTls?: boolean; // ftp explicit TLS
    url?: string; // webdav
    vendor?: string; // webdav: nextcloud | owncloud | other
    // shared remote sub-path/prefix
    path?: string;
    // shared: overrides the instance's ENCRYPTION_KEY as the archive's encryption passphrase
    // for backups sent to this destination. Optional — falls back to the instance key if unset.
    backupPassword?: string;
}

/**
 * Wraps the rclone CLI. Each call writes a throwaway config file (INI, one
 * [dest] remote) into a private temp dir so credentials never touch argv or
 * a long-lived config on disk, then shells out and cleans up.
 */
@Injectable()
export class RcloneService {
    private readonly logger = new Logger(RcloneService.name);
    private available: boolean | null = null;

    isAvailable(): boolean {
        if (this.available === null) {
            const r = spawnSync('rclone', ['version'], { timeout: 5000 });
            this.available = r.status === 0;
        }
        return this.available;
    }

    async copyTo(localFilePath: string, type: BackupDestinationType, config: DestinationConfig, remoteFileName: string): Promise<void> {
        await this.withConfig(type, config, async (configPath) => {
            const remotePath = this.buildRemotePath(config, remoteFileName);
            await this.run(['--config', configPath, 'copyto', localFilePath, remotePath]);
        });
    }

    async deleteFile(type: BackupDestinationType, config: DestinationConfig, remoteFileName: string): Promise<void> {
        await this.withConfig(type, config, async (configPath) => {
            const remotePath = this.buildRemotePath(config, remoteFileName);
            await this.run(['--config', configPath, 'deletefile', remotePath]);
        });
    }

    private async withConfig(type: BackupDestinationType, config: DestinationConfig, fn: (configPath: string) => Promise<void>) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharkshell-rclone-'));
        const configPath = path.join(tmpDir, 'rclone.conf');
        try {
            fs.writeFileSync(configPath, this.buildIniSection(type, config), { mode: 0o600 });
            await fn(configPath);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    }

    private buildRemotePath(config: DestinationConfig, remoteFileName: string): string {
        const parts = [config.bucket, config.path, remoteFileName]
            .filter((p): p is string => !!p && p.length > 0)
            .map((p) => p.replace(/^\/+|\/+$/g, ''));
        return `dest:${parts.join('/')}`;
    }

    private obscure(secret: string): string {
        if (!secret) return '';
        const r = spawnSync('rclone', ['obscure', secret]);
        if (r.status !== 0) throw new Error('Failed to obscure credential via rclone');
        return r.stdout.toString().trim();
    }

    private buildIniSection(type: BackupDestinationType, config: DestinationConfig): string {
        const lines = ['[dest]'];
        switch (type) {
            case 's3':
                lines.push('type = s3');
                lines.push(`provider = ${config.endpoint ? 'Other' : 'AWS'}`);
                lines.push(`access_key_id = ${config.accessKeyId || ''}`);
                lines.push(`secret_access_key = ${config.secretAccessKey || ''}`);
                if (config.region) lines.push(`region = ${config.region}`);
                if (config.endpoint) lines.push(`endpoint = ${config.endpoint}`);
                break;
            case 'gcs': {
                let creds = config.serviceAccountJson || '';
                try { creds = JSON.stringify(JSON.parse(creds)); } catch { /* store as-is, rclone will error clearly */ }
                lines.push('type = google cloud storage');
                lines.push(`service_account_credentials = ${creds}`);
                break;
            }
            case 'sftp':
                lines.push('type = sftp');
                lines.push(`host = ${config.host || ''}`);
                lines.push(`port = ${config.port || 22}`);
                lines.push(`user = ${config.username || ''}`);
                lines.push(`pass = ${this.obscure(config.password || '')}`);
                break;
            case 'ftp':
                lines.push('type = ftp');
                lines.push(`host = ${config.host || ''}`);
                lines.push(`port = ${config.port || 21}`);
                lines.push(`user = ${config.username || ''}`);
                lines.push(`pass = ${this.obscure(config.password || '')}`);
                if (config.useTls) lines.push('explicit_tls = true');
                break;
            case 'webdav':
                lines.push('type = webdav');
                lines.push(`url = ${config.url || ''}`);
                lines.push(`vendor = ${config.vendor || 'other'}`);
                lines.push(`user = ${config.username || ''}`);
                lines.push(`pass = ${this.obscure(config.password || '')}`);
                break;
        }
        return lines.join('\n') + '\n';
    }

    private run(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = spawn('rclone', args, { timeout: 10 * 60 * 1000 });
            let stderr = '';
            proc.stderr.on('data', (d) => (stderr += d.toString()));
            proc.on('error', (err) => reject(new Error(`Failed to spawn rclone: ${err.message}. Is rclone installed in this image?`)));
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`rclone exited with code ${code}: ${stderr.trim().slice(-2000)}`));
            });
        });
    }
}
