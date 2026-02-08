import { Injectable, Logger } from '@nestjs/common';
import { AI_MODEL, AI_REQUEST_DELAY_MS, AI_SYSTEM_PROMPT } from './ai.config';

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl = 'https://openai.api.proxyapi.ru/v1';
  private readonly history = new Map<number, Array<{ role: 'user' | 'assistant'; content: string }>>();
  private readonly maxHistoryItems = 10;

  async generateBusinessReply(chatId: number, input: string): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not set.');
      return null;
    }

    if (AI_REQUEST_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, AI_REQUEST_DELAY_MS));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const history = this.getHistory(chatId);
      const messages = [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: input },
      ];

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          temperature: 0.2,
          messages,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`AI request failed: ${res.status} ${res.statusText} - ${body}`);
        return null;
      }

      const data = (await res.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content ?? null;
      const trimmed = content?.trim() ? content.trim() : null;
      if (trimmed) {
        this.appendHistory(chatId, { role: 'user', content: input }, { role: 'assistant', content: trimmed });
      }
      return trimmed;
    } catch (err) {
      this.logger.warn(`AI request error: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private getHistory(chatId: number): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.history.get(chatId) ?? [];
  }

  private appendHistory(
    chatId: number,
    userMessage: { role: 'user'; content: string },
    assistantMessage: { role: 'assistant'; content: string },
  ): void {
    const items = this.history.get(chatId) ?? [];
    items.push(userMessage, assistantMessage);
    const trimmed = items.slice(-this.maxHistoryItems);
    this.history.set(chatId, trimmed);
  }
}
