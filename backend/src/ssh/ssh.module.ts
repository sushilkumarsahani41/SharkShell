import { Module } from '@nestjs/common';
import { SshGateway } from './ssh.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [AuthModule],
    providers: [SshGateway],
})
export class SshModule { }
