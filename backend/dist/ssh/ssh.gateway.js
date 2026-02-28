"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SshGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const auth_service_1 = require("../auth/auth.service");
const database_service_1 = require("../database/database.service");
const crypto_service_1 = require("../crypto/crypto.service");
const ssh2_1 = require("ssh2");
let SshGateway = class SshGateway {
    constructor(authService, db, cryptoService) {
        this.authService = authService;
        this.db = db;
        this.cryptoService = cryptoService;
        this.clients = new Map();
    }
    async handleConnection(socket) {
        const token = socket.handshake.auth?.token;
        if (!token) {
            socket.emit('ssh:error', { message: 'Authentication required' });
            socket.disconnect();
            return;
        }
        const decoded = this.authService.verifyToken(token);
        if (!decoded) {
            socket.emit('ssh:error', { message: 'Invalid token' });
            socket.disconnect();
            return;
        }
        socket.userId = decoded.id;
        this.clients.set(socket.id, { sshClient: null, sshStream: null });
        console.log(`  🔌 Client connected: ${socket.id}`);
        socket.on('ssh:connect', (data) => this.handleSshConnect(socket, data));
        socket.on('ssh:input', (data) => this.handleSshInput(socket, data));
        socket.on('ssh:resize', (data) => this.handleSshResize(socket, data));
        socket.on('ssh:disconnect', () => this.handleSshDisconnect(socket));
    }
    handleDisconnect(socket) {
        console.log(`  🔌 Client disconnected: ${socket.id}`);
        const clientData = this.clients.get(socket.id);
        if (clientData) {
            if (clientData.sshStream)
                clientData.sshStream.close();
            if (clientData.sshClient)
                clientData.sshClient.end();
            this.clients.delete(socket.id);
        }
    }
    async handleSshConnect(socket, data) {
        try {
            const { hostId, password, passphrase } = data;
            const userId = socket.userId;
            const hostResult = await this.db.query('SELECT * FROM hosts WHERE id = $1 AND user_id = $2', [hostId, userId]);
            if (hostResult.rows.length === 0) {
                socket.emit('ssh:error', { message: 'Host not found' });
                return;
            }
            const host = hostResult.rows[0];
            const connConfig = {
                host: host.hostname,
                port: host.port || 22,
                username: host.username,
                readyTimeout: 20000,
                keepaliveInterval: 10000,
            };
            if (host.auth_type === 'key' && host.ssh_key_id) {
                const keyResult = await this.db.query('SELECT * FROM ssh_keys WHERE id = $1 AND user_id = $2', [host.ssh_key_id, userId]);
                if (keyResult.rows.length > 0) {
                    const key = keyResult.rows[0];
                    const privateKey = this.cryptoService.decrypt(key.private_key_encrypted, key.iv, key.auth_tag);
                    connConfig.privateKey = privateKey;
                    if (passphrase) {
                        connConfig.passphrase = passphrase;
                    }
                    else if (key.passphrase_encrypted && key.passphrase_iv && key.passphrase_auth_tag) {
                        connConfig.passphrase = this.cryptoService.decrypt(key.passphrase_encrypted, key.passphrase_iv, key.passphrase_auth_tag);
                    }
                }
            }
            else if (host.auth_type === 'password') {
                if (password) {
                    connConfig.password = password;
                }
                else if (host.password_encrypted && host.password_iv && host.password_auth_tag) {
                    connConfig.password = this.cryptoService.decrypt(host.password_encrypted, host.password_iv, host.password_auth_tag);
                }
            }
            const sshClient = new ssh2_1.Client();
            const clientData = this.clients.get(socket.id);
            if (clientData) {
                clientData.sshClient = sshClient;
            }
            sshClient.on('ready', () => {
                socket.emit('ssh:connected');
                sshClient.shell({
                    term: 'xterm-256color',
                    cols: data.cols || 80,
                    rows: data.rows || 24,
                }, (err, stream) => {
                    if (err) {
                        socket.emit('ssh:error', { message: 'Failed to open shell: ' + err.message });
                        return;
                    }
                    if (clientData) {
                        clientData.sshStream = stream;
                    }
                    stream.on('data', (chunk) => {
                        socket.emit('ssh:data', chunk.toString('utf-8'));
                    });
                    stream.stderr.on('data', (chunk) => {
                        socket.emit('ssh:data', chunk.toString('utf-8'));
                    });
                    stream.on('close', () => {
                        socket.emit('ssh:closed', { message: 'Session ended' });
                        if (sshClient)
                            sshClient.end();
                    });
                });
            });
            sshClient.on('error', (err) => {
                console.error('SSH connection error:', err.message);
                socket.emit('ssh:error', { message: 'Connection failed: ' + err.message });
            });
            sshClient.on('close', () => {
                socket.emit('ssh:closed', { message: 'Connection closed' });
            });
            sshClient.connect(connConfig);
        }
        catch (err) {
            console.error('SSH proxy error:', err);
            socket.emit('ssh:error', { message: err.message });
        }
    }
    handleSshInput(socket, data) {
        const clientData = this.clients.get(socket.id);
        if (clientData?.sshStream) {
            clientData.sshStream.write(data);
        }
    }
    handleSshResize(socket, data) {
        const clientData = this.clients.get(socket.id);
        if (clientData?.sshStream) {
            clientData.sshStream.setWindow(data.rows, data.cols, 0, 0);
        }
    }
    handleSshDisconnect(socket) {
        const clientData = this.clients.get(socket.id);
        if (clientData) {
            if (clientData.sshStream)
                clientData.sshStream.close();
            if (clientData.sshClient)
                clientData.sshClient.end();
        }
    }
};
exports.SshGateway = SshGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], SshGateway.prototype, "server", void 0);
exports.SshGateway = SshGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        path: '/api/socket',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    }),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        database_service_1.DatabaseService,
        crypto_service_1.CryptoService])
], SshGateway);
//# sourceMappingURL=ssh.gateway.js.map