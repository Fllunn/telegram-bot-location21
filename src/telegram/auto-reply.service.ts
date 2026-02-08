import { Injectable, Logger } from '@nestjs/common';
import TelegramBot, { Message } from 'node-telegram-bot-api';

@Injectable()
export class AutoReplyService {
  private readonly logger = new Logger(AutoReplyService.name);

  async echo(
    bot: TelegramBot,
    msg: Message,
    origin: 'bot' | 'business',
  ): Promise<void> {
    const chatId = msg.chat?.id;
    if (!chatId) {
      this.logger.warn('Cannot echo message: chat id is missing.');
      return;
    }

    const businessConnectionId = (msg as any).business_connection_id as string | undefined;
    const baseOptions = businessConnectionId ? { business_connection_id: businessConnectionId } : {};
    const suffix = origin === 'business' ? 'Это бизнес' : 'Это бот';

    if (msg.text) {
      await bot.sendMessage(chatId, this.appendSuffix(msg.text, suffix), {
        ...baseOptions,
        reply_to_message_id: msg.message_id,
      } as any);
      return;
    }

    if (msg.photo?.length) {
      const photo = msg.photo[msg.photo.length - 1];
      await bot.sendPhoto(chatId, photo.file_id, {
        ...baseOptions,
        caption: this.appendSuffix(msg.caption, suffix),
        reply_to_message_id: msg.message_id,
      } as any);
      return;
    }

    if (msg.video) {
      await bot.sendVideo(chatId, msg.video.file_id, {
        ...baseOptions,
        caption: this.appendSuffix(msg.caption, suffix),
        reply_to_message_id: msg.message_id,
      } as any);
      return;
    }

    if (msg.voice) {
      await bot.sendVoice(chatId, msg.voice.file_id, {
        ...baseOptions,
        reply_to_message_id: msg.message_id,
      } as any);
      return;
    }

    if (msg.document) {
      await bot.sendDocument(chatId, msg.document.file_id, {
        ...baseOptions,
        caption: this.appendSuffix(msg.caption, suffix),
        reply_to_message_id: msg.message_id,
      } as any);
      return;
    }

    if (msg.animation) {
      await bot.sendAnimation(chatId, msg.animation.file_id, {
        ...baseOptions,
        caption: this.appendSuffix(msg.caption, suffix),
        reply_to_message_id: msg.message_id,
      } as any);
      return;
    }

    if (msg.audio) {
      await bot.sendAudio(chatId, msg.audio.file_id, {
        ...baseOptions,
        caption: this.appendSuffix(msg.caption, suffix),
        reply_to_message_id: msg.message_id,
      } as any);
      return;
    }

    if (msg.sticker) {
      await bot.sendSticker(chatId, msg.sticker.file_id, {
        ...baseOptions,
        reply_to_message_id: msg.message_id,
      } as any);
      return;
    }

    if (msg.location) {
      await bot.sendLocation(chatId, msg.location.latitude, msg.location.longitude, {
        ...baseOptions,
        reply_to_message_id: msg.message_id,
      } as any);
      return;
    }

    if (msg.contact) {
      await bot.sendContact(chatId, msg.contact.phone_number, msg.contact.first_name, {
        ...baseOptions,
        last_name: msg.contact.last_name,
        vcard: msg.contact.vcard,
        reply_to_message_id: msg.message_id,
      } as any);
      return;
    }

    this.logger.warn(`No echo handler for message id ${msg.message_id}`);
  }

  private appendSuffix(text: string | undefined, suffix: string): string {
    if (!text || !text.trim()) {
      return suffix;
    }
    return `${text}\n${suffix}`;
  }
}
