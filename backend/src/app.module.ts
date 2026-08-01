import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { HostsModule } from './hosts/hosts.module';
import { KeysModule } from './keys/keys.module';
import { SshModule } from './ssh/ssh.module';
import { GroupsModule } from './groups/groups.module';
import { McpModule } from './mcp/mcp.module';
import { SettingsModule } from './settings/settings.module';
import { MailModule } from './mail/mail.module';
import { OrgModule } from './org/org.module';
import { BackupModule } from './backup/backup.module';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        DatabaseModule,
        CryptoModule,
        SettingsModule,
        MailModule,
        AuthModule,
        HostsModule,
        KeysModule,
        SshModule,
        GroupsModule,
        McpModule,
        OrgModule,
        BackupModule,
    ],
    controllers: [AppController]
})
export class AppModule { }
