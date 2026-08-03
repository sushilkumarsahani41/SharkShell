import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SftpController } from './sftp.controller';
import { SftpService } from './sftp.service';

@Module({
    imports: [AuthModule],
    controllers: [SftpController],
    providers: [SftpService],
})
export class SftpModule { }
