import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { HostsModule } from './hosts/hosts.module';
import { KeysModule } from './keys/keys.module';
import { SshModule } from './ssh/ssh.module';
import { GroupsModule } from './groups/groups.module';

import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
            exclude: ['/api/(.*)'],
        }),
        DatabaseModule,
        CryptoModule,
        AuthModule,
        HostsModule,
        KeysModule,
        SshModule,
        GroupsModule,
    ],
    controllers: [AppController]
})
export class AppModule { }
