import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HostsModule } from '../hosts/hosts.module';
import { KeysModule } from '../keys/keys.module';
import { McpTokenService } from './mcp-token.service';
import { McpTokenController } from './mcp-token.controller';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';

@Module({
    imports: [AuthModule, HostsModule, KeysModule],
    controllers: [McpTokenController, McpController],
    providers: [McpTokenService, McpService],
})
export class McpModule { }
