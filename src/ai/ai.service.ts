import { Injectable, Logger } from '@nestjs/common';
import { AI_MODEL, AI_REQUEST_DELAY_MS, AI_SYSTEM_PROMPT } from './ai.config';
import { buildComplexRecommendation, ComplexRecommendation } from './complex-recommendation';

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
  private readonly lastComplexByChat = new Map<number, ComplexRecommendation>();
  private readonly lastComplexForOutputByChat = new Map<number, string | null>();

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
      const previousComplex = this.lastComplexByChat.get(chatId) ?? null;
      const complexRecommendation = buildComplexRecommendation(input, history, previousComplex);
      if (complexRecommendation) {
        this.lastComplexByChat.set(chatId, complexRecommendation);
      }
      this.lastComplexForOutputByChat.set(
        chatId,
        complexRecommendation ? this.formatComplexRecommendationForUser(complexRecommendation) : null,
      );
      const messages = [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        ...(complexRecommendation
          ? [
              {
                role: 'system' as const,
                content: this.formatComplexRecommendation(complexRecommendation),
              },
            ]
          : []),
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

  private formatComplexRecommendation(rec: {
    master: string;
    title: string;
    discount: number;
    description: string;
  }): string {
    return [
      `Доступная рекомендация для мастера ${rec.master}:`,
      `${rec.title} — скидка ${rec.discount}%.`,
      `Описание: ${rec.description}`,
      'Используй этот блок как отдельную рекомендацию комплекса со скидкой.',
      'Если есть рекомендация комплекса, НЕ предлагай дополнительную услугу.',
      'Не изменяй поле "Услуга" без явного подтверждения клиента.',
    ].join('\n');
  }

  private formatComplexRecommendationForUser(rec: {
    master: string;
    title: string;
    discount: number;
    description: string;
  }): string {
    return [
      `Рекомендация комплекса со скидкой для мастера ${rec.master}:`,
      `**${rec.title} — скидка ${rec.discount}%**.`,
      `Описание: ${rec.description}`,
    ].join('\n');
  }

  takeComplexRecommendationForOutput(chatId: number): string | null {
    const value = this.lastComplexForOutputByChat.get(chatId) ?? null;
    this.lastComplexForOutputByChat.set(chatId, null);
    return value;
  }

  // The model sees the last suggested complex in the system prompt. We keep it stable
  // while the master remains the same, without relying on explicit acceptance keywords.
}
