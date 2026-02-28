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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostsController = void 0;
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const auth_guard_1 = require("../auth/auth.guard");
const hosts_service_1 = require("./hosts.service");
let HostsController = class HostsController {
    constructor(hostsService) {
        this.hostsService = hostsService;
    }
    async findAll(req) {
        const hosts = await this.hostsService.findAllByUser(req.user.id);
        return { hosts };
    }
    async create(req, body, res) {
        const { name, hostname, username } = body;
        if (!name || !hostname || !username) {
            return res.status(400).json({ error: 'Name, hostname, and username are required' });
        }
        const host = await this.hostsService.create(req.user.id, body);
        return res.status(201).json({ host });
    }
    async update(req, id, body, res) {
        const host = await this.hostsService.update(req.user.id, id, body);
        if (!host) {
            return res.status(404).json({ error: 'Host not found' });
        }
        return res.json({ host });
    }
    async remove(req, id, res) {
        const deleted = await this.hostsService.delete(req.user.id, id);
        if (!deleted) {
            return res.status(404).json({ error: 'Host not found' });
        }
        return res.json({ message: 'Host deleted' });
    }
};
exports.HostsController = HostsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HostsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, typeof (_a = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], HostsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, typeof (_b = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], HostsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, typeof (_c = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], HostsController.prototype, "remove", null);
exports.HostsController = HostsController = __decorate([
    (0, common_1.Controller)('hosts'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [hosts_service_1.HostsService])
], HostsController);
//# sourceMappingURL=hosts.controller.js.map