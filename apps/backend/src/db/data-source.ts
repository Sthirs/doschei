import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { env } from '../config/env';
import { Group } from '../entities/Group';
import { User } from '../entities/User';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.DATABASE_URL,
  synchronize: env.DB_SYNC,
  logging: false,
  entities: [User, Group],
});

export const initializeDatabase = async (): Promise<DataSource> => {
  if (AppDataSource.isInitialized) {
    return AppDataSource;
  }

  return AppDataSource.initialize();
};
