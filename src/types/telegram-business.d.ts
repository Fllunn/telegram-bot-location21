import 'node-telegram-bot-api';

declare module 'node-telegram-bot-api' {
  interface TelegramBot {
    on(event: 'business_message', listener: (msg: Message) => void): this;
    on(event: 'edited_business_message', listener: (msg: Message) => void): this;
    on(event: 'deleted_business_messages', listener: (payload: { chat: Chat; message_ids: number[] }) => void): this;
    on(event: 'business_connection', listener: (connection: Record<string, unknown>) => void): this;
  }
}
