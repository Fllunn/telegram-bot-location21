import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly ownerId: number | null;

  constructor() {
    const rawOwnerId = process.env.OWNER_ID;
    if (!rawOwnerId) {
      this.ownerId = null;
      this.logger.warn('OWNER_ID is not set. Owner checks are disabled.');
      return;
    }

    const parsed = Number(rawOwnerId);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      this.ownerId = null;
      this.logger.warn('OWNER_ID is invalid. Owner checks are disabled.');
      return;
    }

    this.ownerId = parsed;
    this.logger.log(`Owner check enabled for user id ${this.ownerId}`);
  }

  isOwner(userId?: number): boolean {
    if (!this.ownerId) {
      return true;
    }

    if (!userId) {
      return false;
    }

    return userId === this.ownerId;
  }
}
