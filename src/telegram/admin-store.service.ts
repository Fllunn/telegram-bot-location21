import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin } from './admin.schema';

@Injectable()
export class AdminStoreService {
  private readonly logger = new Logger(AdminStoreService.name);

  constructor(@InjectModel(Admin.name) private readonly adminModel: Model<Admin>) {}

  async addAdmin(userId: number): Promise<boolean> {
    try {
      await this.adminModel.updateOne(
        { userId },
        { $setOnInsert: { userId } },
        { upsert: true },
      );
      return true;
    } catch (err) {
      this.logger.warn(`Failed to add admin ${userId}: ${(err as Error).message}`);
      return false;
    }
  }

  async removeAdmin(userId: number): Promise<boolean> {
    try {
      const res = await this.adminModel.deleteOne({ userId });
      return res.deletedCount > 0;
    } catch (err) {
      this.logger.warn(`Failed to remove admin ${userId}: ${(err as Error).message}`);
      return false;
    }
  }

  async listAdmins(): Promise<number[]> {
    const docs = await this.adminModel.find({}, { userId: 1, _id: 0 }).lean();
    return docs.map((d) => d.userId).sort((a, b) => a - b);
  }

  async isAdmin(userId?: number): Promise<boolean> {
    if (!userId) return false;
    const count = await this.adminModel.countDocuments({ userId }).limit(1);
    return count > 0;
  }
}
