import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { RcloneService } from './rclone.service';

@Module({
    imports: [AuthModule],
    controllers: [BackupController],
    providers: [BackupService, RcloneService],
})
export class BackupModule { }
