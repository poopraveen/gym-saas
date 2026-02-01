import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mongoose, { Connection } from 'mongoose';

export interface AtlasMembersResponse {
  success: boolean;
  count: number;
  data: Record<string, unknown>[];
}

@Injectable()
export class AtlasMembersService implements OnModuleDestroy {
  private connection: Connection | null = null;

  constructor(private readonly config: ConfigService) {}

  private async getConnection(): Promise<Connection> {
    const uri = this.config.get<string>('MONGO_URI') || this.config.get<string>('MONGODB_URI');
    if (!uri) {
      throw new Error('MONGO_URI or MONGODB_URI must be set in environment');
    }
    if (this.connection) {
      return this.connection;
    }
    const conn = mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    this.connection = await conn.asPromise();
    return this.connection;
  }

  async getGymMembers(): Promise<AtlasMembersResponse> {
    try {
      const conn = await this.getConnection();
      const db = conn.db;
      if (!db) {
        throw new Error('Database connection not ready');
      }
      const collection = db.collection('gym_users');
      const docs = await collection.find({}).toArray();
      const data = docs.map((d) => {
        const obj = d as unknown as Record<string, unknown>;
        const { _id, ...rest } = obj;
        return { _id: String(_id), ...rest };
      });
      return {
        success: true,
        count: data.length,
        data,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch gym members';
      throw new Error(message);
    }
  }

  async onModuleDestroy() {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }
}
