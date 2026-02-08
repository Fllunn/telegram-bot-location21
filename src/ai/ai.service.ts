import { Injectable, Logger } from '@nestjs/common';
import { AI_MODEL, AI_SYSTEM_PROMPT } from './ai.config';

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl = 'https://openai.api.proxyapi.ru/v1';

  async generateBusinessReply(input: string): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not set.');
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          temperature: 0.2,
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: input },
          ],
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
      return content?.trim() ? content.trim() : null;
    } catch (err) {
      this.logger.warn(`AI request error: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
