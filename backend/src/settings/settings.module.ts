import { Module, Global } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UploadLimitService } from './upload-limit.service';

@Global()
@Module({
    providers: [SettingsService, UploadLimitService],
    exports: [SettingsService, UploadLimitService],
})
export class SettingsModule { }
