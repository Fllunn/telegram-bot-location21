import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { Admin, AdminSchema } from '../admin/admin.schema';
import { AdminStoreService } from '../admin/admin-store.service';
import { AutoReplyService } from './auto-reply.service';
import { BotMessageService } from './bot-message.service';
import { BusinessAccessService } from './business-access.service';
import { BusinessMessageService } from './business-message.service';
import { SettingsService } from './settings.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }]),
    AiModule,
  ],
  providers: [
    TelegramService,
    AutoReplyService,
    SettingsService,
    AdminStoreService,
    BusinessAccessService,
    BotMessageService,
    BusinessMessageService,
  ],
})
export class TelegramModule {}
