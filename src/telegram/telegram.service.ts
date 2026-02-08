import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import TelegramBot, { Message } from 'node-telegram-bot-api';
import { AutoReplyService } from './auto-reply.service';
import { SettingsService } from './settings.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: TelegramBot;
  private readonly lastMessages = new Map<number, Message>();
  private pollingActive = false;
  private updateOffset?: number;
  private readonly allowedUpdates = [
    'message',
    'business_message',
    'edited_business_message',
    'deleted_business_messages',
    'business_connection',
  ] as const;

  constructor(
    private readonly autoReplyService: AutoReplyService,
    private readonly settingsService: SettingsService,
  ) {}

  onModuleInit(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new TelegramBot(token, { polling: false });
    this.logger.log('Telegram bot initialized (manual polling).');

    // Webhooks and polling are mutually exclusive. Ensure webhook is disabled.
    this.bot.deleteWebHook({ drop_pending_updates: true }).then(
      () => this.logger.log('Webhook deleted (if any).'),
      (err) => this.logger.warn(`Failed to delete webhook: ${err?.message ?? err}`),
    );

    this.bot
      .getWebHookInfo()
      .then((info) => this.logger.log(`Webhook info: ${JSON.stringify(info)}`))
      .catch((err) => this.logger.warn(`Failed to get webhook info: ${err?.message ?? err}`));

    this.bot
      .getMe()
      .then((me) => this.logger.log(`Bot identity: id=${me.id} username=${me.username ?? 'unknown'}`))
      .catch((err) => this.logger.warn(`Failed to get bot identity: ${err?.message ?? err}`));

    this.startLongPolling();
  }

  onModuleDestroy(): void {
    this.pollingActive = false;
  }

  private async handleMessage(msg: Message, source: string): Promise<void> {
    const chatId = msg.chat?.id;
    if (chatId) {
      this.lastMessages.set(chatId, msg);
    }

    this.logIncomingMessage(msg, source);

    const fromId = msg.from?.id;
    if (!this.settingsService.isOwner(fromId)) {
      this.logger.warn(`Message ignored (not owner). fromId=${fromId ?? 'unknown'}`);
      return;
    }

    try {
      await this.autoReplyService.echo(this.ensureBot(), msg);
    } catch (err) {
      this.logger.error('Failed to auto-reply', err as Error);
    }
  }

  private handleEditedMessage(msg: Message): void {
    this.logIncomingMessage(msg, 'edited_business_message');
  }

  private handleDeletedMessages(payload: { chat: { id: number }; message_ids: number[] }): void {
    this.logger.log(
      `Business messages deleted in chat ${payload.chat?.id ?? 'unknown'}: ${payload.message_ids.join(', ')}`,
    );
  }

  private logIncomingMessage(msg: Message, source: string): void {
    const types = this.detectMessageTypes(msg);
    const summary = {
      source,
      messageId: msg.message_id,
      date: msg.date,
      businessConnectionId: (msg as any).business_connection_id,
      from: msg.from ? {
        id: msg.from.id,
        username: msg.from.username,
        firstName: msg.from.first_name,
        lastName: msg.from.last_name,
      } : null,
      chat: msg.chat ? {
        id: msg.chat.id,
        type: msg.chat.type,
        title: msg.chat.title,
        username: msg.chat.username,
      } : null,
      types,
      text: msg.text,
      caption: msg.caption,
      contact: msg.contact ? {
        phone: msg.contact.phone_number,
        firstName: msg.contact.first_name,
        lastName: msg.contact.last_name,
        userId: msg.contact.user_id,
        vcard: msg.contact.vcard,
      } : null,
      location: msg.location ? {
        latitude: msg.location.latitude,
        longitude: msg.location.longitude,
      } : null,
      media: {
        photo: msg.photo?.map((p) => ({ fileId: p.file_id, width: p.width, height: p.height })),
        video: msg.video ? { fileId: msg.video.file_id, duration: msg.video.duration } : null,
        voice: msg.voice ? { fileId: msg.voice.file_id, duration: msg.voice.duration } : null,
        document: msg.document ? { fileId: msg.document.file_id, fileName: msg.document.file_name } : null,
        animation: msg.animation ? { fileId: msg.animation.file_id, fileName: msg.animation.file_name } : null,
        audio: msg.audio ? { fileId: msg.audio.file_id, performer: msg.audio.performer, title: msg.audio.title } : null,
        sticker: msg.sticker ? { fileId: msg.sticker.file_id, emoji: msg.sticker.emoji } : null,
      },
    };

    this.logger.log(`Incoming message: ${JSON.stringify(summary)}`);
  }

  private detectMessageTypes(msg: Message): string[] {
    const types: string[] = [];

    if (msg.text) types.push('text');
    if (msg.photo?.length) types.push('photo');
    if (msg.video) types.push('video');
    if (msg.voice) types.push('voice');
    if (msg.document) types.push('document');
    if (msg.animation) types.push('animation');
    if (msg.audio) types.push('audio');
    if (msg.sticker) types.push('sticker');
    if (msg.location) types.push('location');
    if (msg.contact) types.push('contact');

    return types.length ? types : ['unknown'];
  }

  private ensureBot(): TelegramBot {
    if (!this.bot) {
      throw new Error('Telegram bot is not initialized');
    }
    return this.bot;
  }

  private startLongPolling(): void {
    if (this.pollingActive) return;
    this.pollingActive = true;

    const poll = async () => {
      if (!this.pollingActive) return;

      try {
        const updates = await this.ensureBot().getUpdates({
          offset: this.updateOffset,
          limit: 50,
          timeout: 10,
          allowed_updates: this.allowedUpdates as unknown as string[],
        });

        for (const update of updates) {
          this.updateOffset = update.update_id + 1;
          this.handleUpdate(update);
        }
      } catch (err) {
        this.logger.warn(`Long polling error: ${(err as Error).message}`);
      } finally {
        if (this.pollingActive) {
          setTimeout(poll, 500);
        }
      }
    };

    poll().catch((err) => this.logger.error('Failed to start long polling', err as Error));
  }

  private handleUpdate(update: any): void {
    const updateKeys = Object.keys(update || {}).filter((key) => key !== 'update_id');
    if (update?.update_id) {
      this.logger.log(`Update received: id=${update.update_id} keys=${updateKeys.join(',') || 'none'}`);
    }

    if (update?.message) {
      this.handleMessage(update.message as Message, 'message(raw)');
    }
    if (update?.business_message) {
      this.handleMessage(update.business_message as Message, 'business_message(raw)');
    }
    if (update?.edited_business_message) {
      this.handleEditedMessage(update.edited_business_message as Message);
    }
    if (update?.deleted_business_messages) {
      this.handleDeletedMessages(update.deleted_business_messages as any);
    }
    if (update?.business_connection) {
      this.logger.log(`Business connection update (raw): ${JSON.stringify(update.business_connection)}`);
    }
  }
}
