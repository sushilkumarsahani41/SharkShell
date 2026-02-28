"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("./database/database.module");
const crypto_module_1 = require("./crypto/crypto.module");
const auth_module_1 = require("./auth/auth.module");
const hosts_module_1 = require("./hosts/hosts.module");
const keys_module_1 = require("./keys/keys.module");
const ssh_module_1 = require("./ssh/ssh.module");
const groups_module_1 = require("./groups/groups.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            crypto_module_1.CryptoModule,
            auth_module_1.AuthModule,
            hosts_module_1.HostsModule,
            keys_module_1.KeysModule,
            ssh_module_1.SshModule,
            groups_module_1.GroupsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map