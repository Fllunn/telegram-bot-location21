import { Injectable, Logger } from '@nestjs/common';
import TelegramBot, { Message } from 'node-telegram-bot-api';
import { AdminStoreService } from './admin-store.service';
import { AutoReplyService } from './auto-reply.service';
import { BusinessAccessService } from './business-access.service';
import { SettingsService } from './settings.service';

@Injectable()
export class BotMessageService {
  private readonly logger = new Logger(BotMessageService.name);

  constructor(
    private readonly autoReplyService: AutoReplyService,
    private readonly settingsService: SettingsService,
    private readonly adminStoreService: AdminStoreService,
    private readonly businessAccessService: BusinessAccessService,
  ) {}

  async isAllowed(msg: Message): Promise<boolean> {
    const fromId = msg.from?.id;

    if (this.settingsService.isOwner(undefined)) {
      return true;
    }

    if (!fromId) return false;

    if (this.settingsService.isOwner(fromId)) {
      return true;
    }

    return this.adminStoreService.isAdmin(fromId);
  }

  async handle(bot: TelegramBot, msg: Message): Promise<void> {
    if (msg.text && msg.text.trim().startsWith('/')) {
      const handled = await this.handleOwnerCommand(bot, msg);
      if (handled) {
        return;
      }
    }

    await this.autoReplyService.echo(bot, msg, 'bot');
  }

  private async handleOwnerCommand(bot: TelegramBot, msg: Message): Promise<boolean> {
    const text = msg.text?.trim() ?? '';
    const chatId = msg.chat?.id;
    const fromId = msg.from?.id;
    if (!chatId || !fromId) {
      return false;
    }

    if (!this.settingsService.isOwner(fromId)) {
      return false;
    }

    const [command, arg] = text.split(/\s+/, 2);

    switch (command) {
      case '/start': {
        const help = [
          'Available commands:',
          '/add_admin <user_id> - add admin',
          '/list_admins - list admins',
          '/remove_admin <user_id> - remove admin',
        ].join('\n');
        await bot.sendMessage(chatId, help);
        return true;
      }
      case '/add_admin': {
        const id = Number(arg);
        if (!Number.isFinite(id)) {
          await bot.sendMessage(chatId, 'Usage: /add_admin <user_id>');
          return true;
        }
        const ok = await this.adminStoreService.addAdmin(id);
        await bot.sendMessage(chatId, ok ? `Admin added: ${id}` : `Failed to add admin: ${id}`);
        return true;
      }
      case '/list_admins': {
        const list = await this.adminStoreService.listAdmins();
        const response = list.length ? list.join('\n') : 'Admin list is empty';
        await bot.sendMessage(chatId, response);
        return true;
      }
      case '/remove_admin': {
        const id = Number(arg);
        if (!Number.isFinite(id)) {
          await bot.sendMessage(chatId, 'Usage: /remove_admin <user_id>');
          return true;
        }
        const removed = await this.adminStoreService.removeAdmin(id);
        if (removed) {
          this.businessAccessService.revokeAdminAccess(id);
        }
        await bot.sendMessage(chatId, removed ? `Admin removed: ${id}` : `Admin not found: ${id}`);
        return true;
      }
      default:
        return false;
    }
  }
}
