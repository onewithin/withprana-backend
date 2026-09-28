import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);

import { PrismaUserRepository } from '../infrastructure/databases/postgres/userRepository.js';
import { MongoUserRepository } from '../infrastructure/databases/mongo/userRepository.js';
import { auditMiddleware } from '../interfaces/middleware/auditMiddleware.js';

dotenv.config();

export let prisma;
export let mongoClient;

let currentUserId = null;

export function setPrismaUser(userId) {
  currentUserId = userId;
}

export function getPrismaUser() {
  return currentUserId;
}


export const createPrismaUserRepository = () => {
  if (!prisma) throw new Error('Prisma client not initialized');
  return new PrismaUserRepository(prisma);
};

export const createMongoUserRepository = () => {
  if (!mongoClient) throw new Error('MongoDB client not initialized');
  return new MongoUserRepository(mongoClient);
};

export const initializeDatabaseConnections = async () => {
  try {
    prisma = new PrismaClient();
    await prisma.$connect();
    console.log('✅ Connected to Postgres via Prisma');

    const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
    mongoClient = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 5000 });
    await mongoClient.connect();
    console.log('✅ Connected to MongoDB');

    return {
      prisma,
      mongoClient
    };
  } catch (err) {
    console.error('❌ Database connection error:', err);
    throw err;
  }
};

export const closeDatabaseConnections = async () => {
  try {
    if (prisma) {
      await prisma.$disconnect();
      console.log('✅ Prisma connection closed');
    }
    if (mongoClient) {
      await mongoClient.close();
      console.log('✅ MongoDB connection closed');
    }
  } catch (err) {
    console.error('❌ Error closing connections:', err);
  }
};