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
  private readonly lastFinalByChat = new Map<number, string>();

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
    const trimmedInput = input.trim();
    if (trimmedInput.length > 200) {
      const businessConnectionId = (msg as any).business_connection_id as string | undefined;
      const baseOptions = businessConnectionId ? { business_connection_id: businessConnectionId } : {};
      await bot.sendMessage(chatId, 'Пожалуйста, сократите сообщение до 200 символов.', {
        ...baseOptions,
        reply_to_message_id: msg.message_id,
        parse_mode: 'Markdown',
      } as any);
      return;
    }

    const response = await this.aiService.generateBusinessReply(chatId, trimmedInput);
    if (!response) {
      return;
    }

    const recommendation = this.aiService.takeComplexRecommendationForOutput(chatId);
    let processed = response;
    if (recommendation) {
      processed = this.stripAdditionalServiceRecommendation(processed);
      processed = this.stripInlineComplexRecommendation(processed);
      processed = this.appendComplexRecommendation(processed, recommendation);
    }
    const enriched = this.enforceFinalPhrase(chatId, processed);
    const filtered = this.normalizeBlankLines(this.filterStatusBlock(enriched));
    if (!filtered.trim()) {
      return;
    }

    const businessConnectionId = (msg as any).business_connection_id as string | undefined;
    const baseOptions = businessConnectionId ? { business_connection_id: businessConnectionId } : {};

    await bot.sendMessage(chatId, filtered, {
      ...baseOptions,
      reply_to_message_id: msg.message_id,
      parse_mode: 'Markdown',
    } as any);

    if (this.containsFinalPhrase(enriched)) {
      await this.notifyAdmins(bot, msg, enriched);
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
    const status = this.parseStatusBlock(lines);
    if (!status) {
      return text;
    }

    const hasUnknown = status.service === '?' || status.master === '?' || status.time === '?';
    const isEmpty = !status.service || !status.master || !status.time;
    if (hasUnknown || isEmpty) {
      return lines.slice(0, -3).join('\n').trimEnd();
    }

    return text;
  }

  private enforceFinalPhrase(chatId: number, text: string): string {
    const lines = text.split(/\r?\n/);
    const status = this.parseStatusBlock(lines);
    if (!status) {
      return this.stripFinalPhrase(text);
    }

    const hasUnknown = status.service === '?' || status.master === '?' || status.time === '?';
    const isEmpty = !status.service || !status.master || !status.time;
    if (hasUnknown || isEmpty) {
      return this.stripFinalPhrase(text);
    }

    const signature = `${status.service}||${status.master}||${status.time}`;
    const lastSignature = this.lastFinalByChat.get(chatId);
    if (lastSignature === signature) {
      return this.stripFinalPhrase(text);
    }

    if (this.containsFinalPhrase(text)) {
      this.lastFinalByChat.set(chatId, signature);
      return text;
    }
    this.lastFinalByChat.set(chatId, signature);
    return `${text.trimEnd()}\n\n${FINAL_PHRASE}`;
  }

  private appendComplexRecommendation(text: string, recommendation: string): string {
    if (text.includes(recommendation)) {
      return text;
    }

    const lines = text.split(/\r?\n/);
    const statusIndex = this.findStatusBlockIndex(lines);
    if (statusIndex === -1) {
      return `${text.trimEnd()}\n\n${recommendation}\n\n`;
    }

    const before = lines.slice(0, statusIndex);
    const status = lines.slice(statusIndex);
    const merged = [
      ...before,
      '',
      recommendation,
      '',
      ...status,
    ];
    return merged.join('\n').trimEnd();
  }

  private findStatusBlockIndex(lines: string[]): number {
    const isLine = (line: string, label: string): boolean => line.startsWith(`${label}:`);
    for (let i = lines.length - 3; i >= 0; i -= 1) {
      if (isLine(lines[i], LABEL_SERVICE) && isLine(lines[i + 1], LABEL_MASTER) && isLine(lines[i + 2], LABEL_TIME)) {
        return i;
      }
    }
    return -1;
  }

  private normalizeBlankLines(text: string): string {
    const lines = text.split(/\r?\n/);
    const normalized: string[] = [];
    let prevBlank = false;
    for (const line of lines) {
      const isBlank = !line.trim();
      if (isBlank) {
        if (prevBlank) {
          continue;
        }
        prevBlank = true;
        normalized.push('');
        continue;
      }
      prevBlank = false;
      normalized.push(line);
    }
    return normalized.join('\n').trimEnd();
  }

  private stripAdditionalServiceRecommendation(text: string): string {
    const triggers = [
      'Ультразвуковая чистка лица',
      'Глиняная маска',
      'Восковая эпиляция',
    ];
    const lines = text.split(/\r?\n/);
    const cleaned: string[] = [];
    let skip = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const isStatusLine =
        trimmed.startsWith(`${LABEL_SERVICE}:`) ||
        trimmed.startsWith(`${LABEL_MASTER}:`) ||
        trimmed.startsWith(`${LABEL_TIME}:`);

      if (skip) {
        if (!trimmed || isStatusLine) {
          skip = false;
          if (isStatusLine) {
            cleaned.push(line);
          }
        }
        continue;
      }

      const hasTrigger =
        trimmed.toLowerCase().includes('дополнительн') ||
        triggers.some((trigger) => trimmed.includes(trigger));

      if (hasTrigger) {
        skip = true;
        continue;
      }

      cleaned.push(line);
    }

    return cleaned.join('\n').trimEnd();
  }

  private stripInlineComplexRecommendation(text: string): string {
    const triggers = ['комплекс', 'скидка'];
    const lines = text.split(/\r?\n/);
    const cleaned: string[] = [];
    let skip = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const isStatusLine =
        trimmed.startsWith(`${LABEL_SERVICE}:`) ||
        trimmed.startsWith(`${LABEL_MASTER}:`) ||
        trimmed.startsWith(`${LABEL_TIME}:`);

      if (skip) {
        if (!trimmed || isStatusLine) {
          skip = false;
          if (isStatusLine) {
            cleaned.push(line);
          }
        }
        continue;
      }

      const lower = trimmed.toLowerCase();
      const hasTrigger = triggers.some((trigger) => lower.includes(trigger));
      if (hasTrigger) {
        skip = true;
        continue;
      }

      cleaned.push(line);
    }

    return cleaned.join('\n').trimEnd();
  }

  private stripFinalPhrase(text: string): string {
    if (!this.containsFinalPhrase(text)) {
      return text;
    }
    const lines = text
      .split(/\r?\n/)
      .filter((line) => line.trim() && line.trim() !== FINAL_PHRASE);
    return lines.join('\n').trimEnd();
  }

  private parseStatusBlock(
    lines: string[],
  ): { service: string; master: string; time: string } | null {
    const parseValue = (line: string, label: string): string | null => {
      const prefix = `${label}:`;
      if (!line.startsWith(prefix)) {
        return null;
      }
      return line.slice(prefix.length).trim();
    };
    for (let i = lines.length - 3; i >= 0; i -= 1) {
      const service = parseValue(lines[i], LABEL_SERVICE);
      const master = parseValue(lines[i + 1], LABEL_MASTER);
      const time = parseValue(lines[i + 2], LABEL_TIME);
      if (service === null || master === null || time === null) {
        continue;
      }
      return { service, master, time };
    }
    return null;
  }
}
