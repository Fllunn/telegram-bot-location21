import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private ownerIds: Set<number> = new Set();
  private readonly strictBusinessConnection: boolean;

  constructor() {
    const rawStrict = (process.env.STRICT_BUSINESS_CONNECTION ?? 'true').trim().toLowerCase();
    this.strictBusinessConnection = rawStrict !== 'false' && rawStrict !== '0' && rawStrict !== 'no';

    this.loadOwnersFromEnv(true);
    this.logger.log(`Strict business connection check: ${this.strictBusinessConnection}`);
  }

  isOwner(userId?: number): boolean {
    if (this.ownerIds.size === 0) {
      this.loadOwnersFromEnv(false);
    }

    if (this.ownerIds.size === 0) {
      return true;
    }

    if (!userId) {
      return false;
    }

    return this.ownerIds.has(userId);
  }

  isAllowedForBusinessMessage(chatId?: number): boolean {
    if (this.ownerIds.size === 0) {
      this.loadOwnersFromEnv(false);
    }

    if (this.ownerIds.size === 0) {
      return true;
    }

    if (!chatId) {
      return false;
    }

    return this.ownerIds.has(chatId);
  }

  isStrictBusinessConnection(): boolean {
    return this.strictBusinessConnection;
  }

  getOwnerIds(): number[] {
    if (this.ownerIds.size === 0) {
      this.loadOwnersFromEnv(false);
    }
    return Array.from(this.ownerIds);
  }

  private loadOwnersFromEnv(isStartup: boolean): void {
    const raw = (process.env.OWNER_ID ?? '').trim();
    const ids = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    this.ownerIds = new Set(ids);

    if (this.ownerIds.size === 0) {
      if (isStartup) {
        this.logger.warn('OWNER_ID is not set or invalid. Owner checks are disabled.');
      }
      return;
    }

    if (isStartup) {
      this.logger.log(`Owner check enabled for user ids: ${Array.from(this.ownerIds).join(', ')}`);
    }
  }
}
