import { Injectable } from '@nestjs/common';
import { Client } from 'ssh2';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';
import { HostsService } from '../hosts/hosts.service';
import { KeysService } from '../keys/keys.service';
import { McpTokenService, McpKey } from './mcp-token.service';

const MAX_OUTPUT_BYTES = 200 * 1024;
const DEFAULT_TIMEOUT_S = 30;
const MAX_TIMEOUT_S = 300;

/** Raised for policy denials so the controller/audit can distinguish them from runtime errors. */
class DeniedError extends Error { }

@Injectable()
export class McpService {
    constructor(
        private db: DatabaseService,
        private cryptoService: CryptoService,
        private hostsService: HostsService,
        private keysService: KeysService,
        private tokens: McpTokenService,
    ) { }

    private allTools() {
        return [
            {
                name: 'list_hosts',
                description: 'List SSH hosts this key may reach (name, address, port, username, auth type, group). Use the returned id or name with run_command.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'list_ssh_keys',
                description: 'List SSH keys stored in the SharkShell keystore. Returns metadata and public keys only — private keys are never exposed.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'run_command',
                description: 'Execute a shell command on a saved SSH host using its stored credentials. Returns stdout, stderr and the exit code. Fails if the host has no saved credentials or is out of this key\'s scope.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        host: { type: 'string', description: 'Host id or host name, as returned by list_hosts' },
                        command: { type: 'string', description: 'Shell command to execute on the remote host' },
                        timeout_seconds: { type: 'number', description: `Timeout in seconds (default ${DEFAULT_TIMEOUT_S}, max ${MAX_TIMEOUT_S})` },
                    },
                    required: ['host', 'command'],
                },
            },
            {
                name: 'download_file',
                description: `Read a text file from a saved SSH host over SFTP — config files, logs, scripts, small data files. Not for binary files. Truncated at ${MAX_OUTPUT_BYTES / 1024}KB.`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        host: { type: 'string', description: 'Host id or host name, as returned by list_hosts' },
                        path: { type: 'string', description: 'Absolute or home-relative path to the remote file' },
                    },
                    required: ['host', 'path'],
                },
            },
            {
                name: 'upload_file',
                description: `Write text content to a file on a saved SSH host over SFTP, creating or overwriting it. For config files, scripts, or small data files — max ${MAX_OUTPUT_BYTES / 1024}KB of content.`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        host: { type: 'string', description: 'Host id or host name, as returned by list_hosts' },
                        path: { type: 'string', description: 'Absolute or home-relative path to write on the remote host' },
                        content: { type: 'string', description: 'Text content to write to the file' },
                    },
                    required: ['host', 'path', 'content'],
                },
            },
        ];
    }

    listTools(key: McpKey) {
        const tools = this.allTools();
        // A read-only key must not even advertise mutating tools.
        const writeTools = ['run_command', 'upload_file'];
        return key.capability === 'read_only' ? tools.filter(t => !writeTools.includes(t.name)) : tools;
    }

    async callTool(key: McpKey, name: string, args: any) {
        try {
            let result: { content: any[]; isError?: boolean };
            let auditHost: { id?: string; name?: string } = {};

            switch (name) {
                case 'list_hosts':
                    result = this.textResult(await this.scopedHosts(key));
                    break;
                case 'list_ssh_keys': {
                    const keys = await this.keysService.findAllByUser(key.user_id);
                    result = this.textResult(keys.map(k => ({
                        id: k.id, name: k.name, key_type: k.key_type,
                        fingerprint: k.fingerprint, public_key: k.public_key,
                        group_name: k.group_name, has_passphrase: k.has_passphrase,
                    })));
                    break;
                }
                case 'run_command': {
                    const out = await this.runCommand(key, args);
                    auditHost = { id: out.hostId, name: out.hostName };
                    result = this.textResult(out.text);
                    break;
                }
                case 'download_file': {
                    const out = await this.downloadFile(key, args);
                    auditHost = { id: out.hostId, name: out.hostName };
                    result = this.textResult(out.text);
                    break;
                }
                case 'upload_file': {
                    const out = await this.uploadFile(key, args);
                    auditHost = { id: out.hostId, name: out.hostName };
                    result = this.textResult(out.text);
                    break;
                }
                default: {
                    const err: any = new Error(`Unknown tool: ${name}`);
                    err.rpcCode = -32602;
                    throw err;
                }
            }

            await this.tokens.logAudit({
                userId: key.user_id, tokenId: key.id, tokenLabel: key.label,
                toolName: name, hostId: auditHost.id, hostName: auditHost.name,
                command: this.auditDetail(name, args), status: 'success',
            });
            return result;
        } catch (err: any) {
            if (err?.rpcCode) throw err; // protocol-level error, not an auditable tool failure
            const denied = err instanceof DeniedError;
            await this.tokens.logAudit({
                userId: key.user_id, tokenId: key.id, tokenLabel: key.label,
                toolName: name, hostId: null, hostName: ['run_command', 'download_file', 'upload_file'].includes(name) ? args?.host : null,
                command: this.auditDetail(name, args),
                status: denied ? 'denied' : 'error', detail: err?.message,
            });
            return { content: [{ type: 'text', text: `${denied ? 'Denied' : 'Error'}: ${err?.message || err}` }], isError: true };
        }
    }

    private auditDetail(toolName: string, args: any): string | null {
        if (toolName === 'run_command') return args?.command ?? null;
        if (toolName === 'download_file' || toolName === 'upload_file') return args?.path ?? null;
        return null;
    }

    private textResult(value: any) {
        const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        return { content: [{ type: 'text', text }] };
    }

    private async scopedHosts(key: McpKey) {
        const hosts = await this.hostsService.findAllByUser(key.user_id);
        return hosts
            .filter(h => this.tokens.isHostAllowed(key, h))
            .map(h => ({
                id: h.id, name: h.name, hostname: h.hostname, port: h.port,
                username: h.username, auth_type: h.auth_type,
                key_name: h.key_name, group_name: h.group_name,
                has_saved_password: h.has_password,
            }));
    }

    // Shared by run_command/download_file/upload_file: resolves the host by id or name,
    // scoped to this user, and enforces the access key's allowed-host scope on the
    // RESOLVED row — this is the real gate, not list_hosts' filtering.
    private async resolveHost(key: McpKey, hostArg: string) {
        if (!hostArg) {
            const err: any = new Error('"host" argument is required');
            err.rpcCode = -32602;
            throw err;
        }
        const result = await this.db.query(
            `SELECT * FROM hosts WHERE user_id = $1 AND (id::text = $2 OR LOWER(name) = LOWER($2)) LIMIT 1`,
            [key.user_id, String(hostArg)],
        );
        if (result.rows.length === 0) {
            throw new Error(`Host not found: "${hostArg}". Use list_hosts to see available hosts.`);
        }
        const hostRow = result.rows[0];
        if (!this.tokens.isHostAllowed(key, hostRow)) {
            throw new DeniedError(`Host "${hostRow.name}" is not in this access key's allowed scope.`);
        }
        return hostRow;
    }

    private async runCommand(key: McpKey, args: any): Promise<{ text: string; hostId: string; hostName: string }> {
        if (key.capability === 'read_only') {
            throw new DeniedError('This access key is read-only and cannot run commands.');
        }
        const { command } = args;
        if (!command) {
            const err: any = new Error('"command" argument is required');
            err.rpcCode = -32602;
            throw err;
        }
        const timeoutS = Math.min(Math.max(Number(args.timeout_seconds) || DEFAULT_TIMEOUT_S, 1), MAX_TIMEOUT_S);
        const hostRow = await this.resolveHost(key, args.host);
        const connConfig = await this.buildConnConfig(key.user_id, hostRow);
        const exec = await this.execOnHost(connConfig, command, timeoutS * 1000);

        const parts = [`Host: ${hostRow.name} (${hostRow.username}@${hostRow.hostname}:${hostRow.port})`];
        parts.push(`Exit code: ${exec.code === null ? `killed by signal ${exec.signal || 'unknown'}` : exec.code}`);
        parts.push(`--- stdout ---\n${exec.stdout || '(empty)'}`);
        if (exec.stderr) parts.push(`--- stderr ---\n${exec.stderr}`);
        if (exec.truncated) parts.push(`(output truncated at ${MAX_OUTPUT_BYTES / 1024}KB)`);
        return { text: parts.join('\n'), hostId: hostRow.id, hostName: hostRow.name };
    }

    private async downloadFile(key: McpKey, args: any): Promise<{ text: string; hostId: string; hostName: string }> {
        const { path } = args;
        if (!path) {
            const err: any = new Error('"path" argument is required');
            err.rpcCode = -32602;
            throw err;
        }
        const hostRow = await this.resolveHost(key, args.host);
        const connConfig = await this.buildConnConfig(key.user_id, hostRow);
        const file = await this.sftpRead(connConfig, path);

        const parts = [`Host: ${hostRow.name} (${hostRow.username}@${hostRow.hostname}:${hostRow.port})`, `File: ${path}`, '---', file.text];
        if (file.truncated) parts.push(`(output truncated at ${MAX_OUTPUT_BYTES / 1024}KB)`);
        return { text: parts.join('\n'), hostId: hostRow.id, hostName: hostRow.name };
    }

    private async uploadFile(key: McpKey, args: any): Promise<{ text: string; hostId: string; hostName: string }> {
        if (key.capability === 'read_only') {
            throw new DeniedError('This access key is read-only and cannot write files.');
        }
        const { path, content } = args;
        if (!path || content === undefined || content === null) {
            const err: any = new Error('"path" and "content" arguments are required');
            err.rpcCode = -32602;
            throw err;
        }
        if (Buffer.byteLength(String(content), 'utf-8') > MAX_OUTPUT_BYTES) {
            throw new Error(`Content too large (max ${MAX_OUTPUT_BYTES / 1024}KB via MCP — use the SharkShell SFTP page for larger files)`);
        }
        const hostRow = await this.resolveHost(key, args.host);
        const connConfig = await this.buildConnConfig(key.user_id, hostRow);
        const bytes = await this.sftpWrite(connConfig, path, String(content));
        return { text: `Wrote ${bytes} bytes to ${path} on ${hostRow.name}`, hostId: hostRow.id, hostName: hostRow.name };
    }

    private async buildConnConfig(userId: string, host: any): Promise<any> {
        const connConfig: any = {
            host: host.hostname,
            port: host.port || 22,
            username: host.username,
            readyTimeout: 20000,
        };

        if (host.auth_type === 'key') {
            if (!host.ssh_key_id) {
                throw new Error(`Host "${host.name}" has no SSH key assigned. Assign a key in SharkShell first.`);
            }
            const keyResult = await this.db.query(
                'SELECT * FROM ssh_keys WHERE id = $1 AND user_id = $2',
                [host.ssh_key_id, userId],
            );
            if (keyResult.rows.length === 0) {
                throw new Error(`The SSH key assigned to host "${host.name}" no longer exists.`);
            }
            const key = keyResult.rows[0];
            connConfig.privateKey = this.cryptoService.decrypt(key.private_key_encrypted, key.iv, key.auth_tag);
            if (key.passphrase_encrypted && key.passphrase_iv && key.passphrase_auth_tag) {
                connConfig.passphrase = this.cryptoService.decrypt(key.passphrase_encrypted, key.passphrase_iv, key.passphrase_auth_tag);
            }
        } else if (host.auth_type === 'password') {
            if (!host.password_encrypted || !host.password_iv || !host.password_auth_tag) {
                throw new Error(`Host "${host.name}" uses password auth but has no saved password. Save the password in SharkShell to use it via MCP.`);
            }
            connConfig.password = this.cryptoService.decrypt(host.password_encrypted, host.password_iv, host.password_auth_tag);
        } else {
            throw new Error(`Host "${host.name}" has unsupported auth type: ${host.auth_type}`);
        }
        return connConfig;
    }

    private execOnHost(connConfig: any, command: string, timeoutMs: number) {
        return new Promise<{ stdout: string; stderr: string; code: number | null; signal?: string; truncated: boolean }>((resolve, reject) => {
            const client = new Client();
            let settled = false;
            let stdout = '';
            let stderr = '';
            let total = 0;
            let truncated = false;

            const finish = (fn: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn();
                client.end();
            };
            const timer = setTimeout(
                () => finish(() => reject(new Error(`Command timed out after ${timeoutMs / 1000}s`))),
                timeoutMs,
            );

            const append = (chunk: Buffer, target: 'stdout' | 'stderr') => {
                if (total >= MAX_OUTPUT_BYTES) { truncated = true; return; }
                const room = MAX_OUTPUT_BYTES - total;
                const text = chunk.toString('utf-8');
                const sliced = text.length > room ? text.slice(0, room) : text;
                if (sliced.length < text.length) truncated = true;
                total += sliced.length;
                if (target === 'stdout') stdout += sliced;
                else stderr += sliced;
            };

            client.on('ready', () => {
                client.exec(command, (err, stream) => {
                    if (err) return finish(() => reject(new Error('Failed to execute command: ' + err.message)));
                    stream.on('data', (chunk: Buffer) => append(chunk, 'stdout'));
                    stream.stderr.on('data', (chunk: Buffer) => append(chunk, 'stderr'));
                    stream.on('close', (code: number | null, signal?: string) => {
                        finish(() => resolve({ stdout, stderr, code, signal, truncated }));
                    });
                });
            });
            client.on('error', (err) => finish(() => reject(new Error('SSH connection failed: ' + err.message))));
            client.connect(connConfig);
        });
    }

    private sftpRead(connConfig: any, remotePath: string): Promise<{ text: string; truncated: boolean }> {
        return new Promise((resolve, reject) => {
            const client = new Client();
            let settled = false;
            const finish = (fn: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn();
                client.end();
            };
            const timer = setTimeout(() => finish(() => reject(new Error('SFTP operation timed out'))), 20000);

            client.on('ready', () => {
                client.sftp((err, sftp) => {
                    if (err) return finish(() => reject(new Error('Failed to start SFTP: ' + err.message)));
                    const stream = sftp.createReadStream(remotePath);
                    let text = '';
                    let total = 0;
                    let truncated = false;
                    stream.on('data', (chunk: Buffer) => {
                        if (total >= MAX_OUTPUT_BYTES) { truncated = true; return; }
                        const room = MAX_OUTPUT_BYTES - total;
                        const chunkText = chunk.toString('utf-8');
                        const sliced = chunkText.length > room ? chunkText.slice(0, room) : chunkText;
                        if (sliced.length < chunkText.length) truncated = true;
                        total += sliced.length;
                        text += sliced;
                    });
                    stream.on('error', (e: any) => finish(() => reject(new Error(`Failed to read "${remotePath}": ${e.message}`))));
                    stream.on('close', () => finish(() => resolve({ text, truncated })));
                });
            });
            client.on('error', (err) => finish(() => reject(new Error('SSH connection failed: ' + err.message))));
            client.connect(connConfig);
        });
    }

    private sftpWrite(connConfig: any, remotePath: string, content: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const client = new Client();
            let settled = false;
            const finish = (fn: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn();
                client.end();
            };
            const timer = setTimeout(() => finish(() => reject(new Error('SFTP operation timed out'))), 20000);

            client.on('ready', () => {
                client.sftp((err, sftp) => {
                    if (err) return finish(() => reject(new Error('Failed to start SFTP: ' + err.message)));
                    const writeStream = sftp.createWriteStream(remotePath);
                    writeStream.on('error', (e: any) => finish(() => reject(new Error(`Failed to write "${remotePath}": ${e.message}`))));
                    writeStream.on('close', () => finish(() => resolve(Buffer.byteLength(content, 'utf-8'))));
                    writeStream.end(content, 'utf-8');
                });
            });
            client.on('error', (err) => finish(() => reject(new Error('SSH connection failed: ' + err.message))));
            client.connect(connConfig);
        });
    }
}
