import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { AdminStoreService } from '../admin/admin-store.service';
import { SettingsService } from './settings.service';

@Injectable()
export class BusinessAccessService {
  private readonly logger = new Logger(BusinessAccessService.name);
  private readonly allowedBusinessConnections = new Set<string>();
  private readonly businessConnectionOwners = new Map<string, number>();

  constructor(
    private readonly settingsService: SettingsService,
    private readonly adminStoreService: AdminStoreService,
  ) {}

  async isBusinessConnectionAllowed(
    businessConnectionId: string | undefined,
    bot: TelegramBot,
  ): Promise<boolean> {
    if (this.settingsService.isOwner(undefined)) {
      return true;
    }

    if (!businessConnectionId) {
      return false;
    }

    if (this.allowedBusinessConnections.has(businessConnectionId)) {
      return true;
    }

    if (this.settingsService.isStrictBusinessConnection()) {
      const resolvedOwnerId = await this.resolveBusinessConnectionOwner(businessConnectionId, bot);
      const ownerAllowed = resolvedOwnerId
        ? this.settingsService.isOwner(resolvedOwnerId) || (await this.adminStoreService.isAdmin(resolvedOwnerId))
        : false;
      if (ownerAllowed && resolvedOwnerId !== undefined) {
        this.allowedBusinessConnections.add(businessConnectionId);
        this.businessConnectionOwners.set(businessConnectionId, resolvedOwnerId);
        this.logger.log(
          `Business connection resolved via API and allowed: ${businessConnectionId} (userId=${resolvedOwnerId})`,
        );
        return true;
      }

      this.logger.warn(`Business connection not registered via update. Blocking: ${businessConnectionId}`);
      return false;
    }

    this.allowedBusinessConnections.add(businessConnectionId);
    this.logger.warn(
      `Business connection not registered via update. Allowing and caching: ${businessConnectionId}`,
    );
    return true;
  }

  handleBusinessConnection(connection: any): void {
    const connectionId =
      (connection?.id as string | undefined) ??
      (connection?.business_connection_id as string | undefined) ??
      (connection?.connection_id as string | undefined);
    const userId =
      (connection?.user?.id as number | undefined) ??
      (connection?.user_id as number | undefined) ??
      (connection?.owner_id as number | undefined);

    if (!connectionId) {
      this.logger.warn(`Business connection update missing id: ${JSON.stringify(connection)}`);
      return;
    }

    if (!userId) {
      this.logger.warn(`Business connection update missing user id: ${JSON.stringify(connection)}`);
      return;
    }

    const allow = this.settingsService.isOwner(userId);
    if (allow) {
      this.allowedBusinessConnections.add(connectionId);
      this.businessConnectionOwners.set(connectionId, userId);
      this.logger.log(`Business connection allowed: ${connectionId} (userId=${userId})`);
      return;
    }

    // For admins, resolve lazily via API in strict mode.
    if (!this.settingsService.isStrictBusinessConnection()) {
      this.allowedBusinessConnections.add(connectionId);
      this.businessConnectionOwners.set(connectionId, userId);
      this.logger.log(`Business connection allowed (non-strict): ${connectionId} (userId=${userId})`);
      return;
    }

    this.logger.warn(
      `Business connection ignored: ${connectionId} (userId=${userId}) not in OWNER_ID`,
    );
  }

  revokeAdminAccess(userId: number): void {
    for (const [connectionId, ownerId] of this.businessConnectionOwners.entries()) {
      if (ownerId === userId) {
        this.businessConnectionOwners.delete(connectionId);
        this.allowedBusinessConnections.delete(connectionId);
      }
    }
  }

  private async resolveBusinessConnectionOwner(
    businessConnectionId: string,
    bot: TelegramBot,
  ): Promise<number | undefined> {
    const cached = this.businessConnectionOwners.get(businessConnectionId);
    if (cached) {
      return cached;
    }

    const botAny = bot as any;

    try {
      if (typeof botAny.getBusinessConnection === 'function') {
        const connection = await botAny.getBusinessConnection(businessConnectionId);
        return (connection?.user?.id as number | undefined) ?? (connection?.user_id as number | undefined);
      }

      if (typeof botAny._request === 'function') {
        const connection = await botAny._request('getBusinessConnection', {
          qs: { business_connection_id: businessConnectionId },
        });
        return (connection?.user?.id as number | undefined) ?? (connection?.user_id as number | undefined);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to resolve business connection owner for ${businessConnectionId}: ${(err as Error).message}`,
      );
    }

    return undefined;
  }
}
