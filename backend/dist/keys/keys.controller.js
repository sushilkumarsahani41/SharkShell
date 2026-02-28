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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeysController = void 0;
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const auth_guard_1 = require("../auth/auth.guard");
const keys_service_1 = require("./keys.service");
let KeysController = class KeysController {
    constructor(keysService) {
        this.keysService = keysService;
    }
    async findAll(req) {
        const keys = await this.keysService.findAllByUser(req.user.id);
        return { keys };
    }
    async create(req, body, res) {
        try {
            if (body.action === 'generate') {
                const key = await this.keysService.generate(req.user.id, body);
                return res.status(201).json({ key });
            }
            if (!body.name || !body.privateKey) {
                return res.status(400).json({ error: 'Name and privateKey are required' });
            }
            const key = await this.keysService.upload(req.user.id, body);
            return res.status(201).json({ key });
        }
        catch (err) {
            console.error('Key operation error:', err);
            return res.status(500).json({ error: err.message || 'Key operation failed' });
        }
    }
    async findOne(req, id, res) {
        const key = await this.keysService.findById(req.user.id, id);
        if (!key) {
            return res.status(404).json({ error: 'Key not found' });
        }
        return res.json({ key });
    }
    async update(req, id, body, res) {
        const key = await this.keysService.updateName(req.user.id, id, body.name);
        if (!key) {
            return res.status(404).json({ error: 'Key not found' });
        }
        return res.json({ key });
    }
    async remove(req, id, res) {
        const deleted = await this.keysService.delete(req.user.id, id);
        if (!deleted) {
            return res.status(404).json({ error: 'Key not found' });
        }
        return res.json({ message: 'Key deleted' });
    }
    async exportKey(req, body, res) {
        try {
            if (!body.keyId || !body.hostId) {
                return res.status(400).json({ error: 'keyId and hostId are required' });
            }
            const result = await this.keysService.exportToHost(req.user.id, body);
            return res.json(result);
        }
        catch (err) {
            console.error('Export error:', err);
            return res.status(502).json({ error: err.message || 'Export failed' });
        }
    }
};
exports.KeysController = KeysController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], KeysController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, typeof (_a = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], KeysController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, typeof (_b = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], KeysController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, typeof (_c = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], KeysController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, typeof (_d = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], KeysController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('export'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, typeof (_e = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], KeysController.prototype, "exportKey", null);
exports.KeysController = KeysController = __decorate([
    (0, common_1.Controller)('keys'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [keys_service_1.KeysService])
], KeysController);
//# sourceMappingURL=keys.controller.js.map