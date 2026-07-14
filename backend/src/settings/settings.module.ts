import { Module, Global } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Global()
@Module({
    providers: [SettingsService],
    exports: [SettingsService],
})
export class SettingsModule { }
