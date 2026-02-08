import { Injectable } from '@nestjs/common';
import TelegramBot, { Message } from 'node-telegram-bot-api';
import { AutoReplyService } from './auto-reply.service';
import { BusinessAccessService } from './business-access.service';

@Injectable()
export class BusinessMessageService {
  constructor(
    private readonly autoReplyService: AutoReplyService,
    private readonly businessAccessService: BusinessAccessService,
  ) {}

  async isAllowed(msg: Message, bot: TelegramBot): Promise<boolean> {
    const businessConnectionId = (msg as any).business_connection_id as string | undefined;
    return this.businessAccessService.isBusinessConnectionAllowed(businessConnectionId, bot);
  }

  async handle(bot: TelegramBot, msg: Message): Promise<void> {
    await this.autoReplyService.echo(bot, msg, 'business');
  }
}
