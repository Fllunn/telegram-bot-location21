import { Injectable } from '@nestjs/common';
import TelegramBot, { Message } from 'node-telegram-bot-api';
import { AiService } from '../ai/ai.service';
import { BusinessAccessService } from './business-access.service';

@Injectable()
export class BusinessMessageService {
  constructor(
    private readonly aiService: AiService,
    private readonly businessAccessService: BusinessAccessService,
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

    const response = await this.aiService.generateBusinessReply(input.trim());
    if (!response) {
      return;
    }

    const businessConnectionId = (msg as any).business_connection_id as string | undefined;
    const baseOptions = businessConnectionId ? { business_connection_id: businessConnectionId } : {};

    await bot.sendMessage(chatId, response, {
      ...baseOptions,
      reply_to_message_id: msg.message_id,
    } as any);
  }
}
