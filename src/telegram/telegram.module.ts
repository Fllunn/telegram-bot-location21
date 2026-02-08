import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from './admin.schema';
import { AdminStoreService } from './admin-store.service';
import { AutoReplyService } from './auto-reply.service';
import { SettingsService } from './settings.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }])],
  providers: [TelegramService, AutoReplyService, SettingsService, AdminStoreService],
})
export class TelegramModule {}
