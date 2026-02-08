import { Injectable } from '@nestjs/common';
import TelegramBot, { Message } from 'node-telegram-bot-api';
import { AdminStoreService } from '../admin/admin-store.service';
import { AiService } from '../ai/ai.service';
import { BusinessAccessService } from './business-access.service';
import { SettingsService } from './settings.service';

const FINAL_PHRASE = 'Скоро подключится администратор и запишет вас, если есть свободные слоты.';
const LABEL_SERVICE = 'Услуга';
const LABEL_MASTER = 'Мастер';
const LABEL_TIME = 'Время';

@Injectable()
export class BusinessMessageService {
  constructor(
    private readonly aiService: AiService,
    private readonly businessAccessService: BusinessAccessService,
    private readonly adminStoreService: AdminStoreService,
    private readonly settingsService: SettingsService,
  ) {}

  async isAllowed(msg: Message, bot: TelegramBot): Promise<boolean> {
    const businessConnectionId = (msg as any).business_connection_id as string | undefined;
    return this.businessAccessService.isBusinessConnectionAllowed(businessConnectionId, bot);
  }

  async handle(bot: TelegramBot, msg: Message): Promise<void> {
    const chatId = msg.chat?.id;
    if (!chatId) {
      return;
    }

    const input = msg.text ?? msg.caption;
    if (!input || !input.trim()) {
      return;
    }

    const response = await this.aiService.generateBusinessReply(chatId, input.trim());
    if (!response) {
      return;
    }

    const filtered = this.filterStatusBlock(response);
    if (!filtered.trim()) {
      return;
    }

    const businessConnectionId = (msg as any).business_connection_id as string | undefined;
    const baseOptions = businessConnectionId ? { business_connection_id: businessConnectionId } : {};

    await bot.sendMessage(chatId, filtered, {
      ...baseOptions,
      reply_to_message_id: msg.message_id,
    } as any);

    if (this.containsFinalPhrase(response)) {
      await this.notifyAdmins(bot, msg, response);
    }
  }

  private containsFinalPhrase(text: string): boolean {
    return text.includes(FINAL_PHRASE);
  }

  private async notifyAdmins(bot: TelegramBot, msg: Message, text: string): Promise<void> {
    const owners = this.settingsService.getOwnerIds();
    const admins = await this.adminStoreService.listAdmins();
    const targets = Array.from(new Set([...owners, ...admins])).filter(Boolean);
    if (targets.length === 0) {
      return;
    }

    const link = this.formatUserLink(msg.from);
    const details = this.extractFinalDetails(text);
    const lines = [
      'Новая заявка!',
      'Клиент: ' + link,
      ...details,
    ];
    const payload = lines.join('\n');

    await Promise.all(
      targets.map((id) => bot.sendMessage(id, payload).catch(() => undefined)),
    );
  }

  private formatUserLink(from: Message['from']): string {
    const id = from?.id;
    const username = from?.username;
    if (username) {
      return `https://t.me/${username}`;
    }
    if (id) {
      return `tg://user?id=${id}`;
    }
    return 'unknown';
  }

  private extractFinalDetails(text: string): string[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const lastServiceIndex = lines.findIndex((l) => l.startsWith(`${LABEL_SERVICE}:`));
    if (lastServiceIndex === -1) {
      return [];
    }

    const details = lines.slice(lastServiceIndex, lastServiceIndex + 3);
    return details.filter(
      (l) =>
        l.startsWith(`${LABEL_SERVICE}:`) ||
        l.startsWith(`${LABEL_MASTER}:`) ||
        l.startsWith(`${LABEL_TIME}:`),
    );
  }

  private filterStatusBlock(text: string): string {
    const lines = text.split(/\r?\n/);
    if (lines.length < 3) {
      return text;
    }

    const last3 = lines.slice(-3);
    const parseValue = (line: string, label: string): string | null => {
      const prefix = `${label}:`;
      if (!line.startsWith(prefix)) {
        return null;
      }
      return line.slice(prefix.length).trim();
    };

    const service = parseValue(last3[0], LABEL_SERVICE);
    const master = parseValue(last3[1], LABEL_MASTER);
    const time = parseValue(last3[2], LABEL_TIME);

    if (service === null || master === null || time === null) {
      return text;
    }

    const hasUnknown = service === '?' || master === '?' || time === '?';
    const isEmpty = !service || !master || !time;
    if (hasUnknown || isEmpty) {
      return lines.slice(0, -3).join('\n').trimEnd();
    }

    return text;
  }
}
