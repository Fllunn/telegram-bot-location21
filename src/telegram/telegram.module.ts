import { Module } from '@nestjs/common';
import { AutoReplyService } from './auto-reply.service';
import { SettingsService } from './settings.service';
import { TelegramService } from './telegram.service';

@Module({
  providers: [TelegramService, AutoReplyService, SettingsService],
})
export class TelegramModule {}
