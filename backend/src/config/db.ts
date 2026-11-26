import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { env } from './env';

let replSet: MongoMemoryReplSet | null = null;
let connectedUri: string | null = null;

/**
 * Connects to MongoDB Atlas (via MONGO_URI) or starts an in-memory replica set
 * so Mongoose multi-document ACID transactions work identically in local dev & tests.
 */
export async function connectDB(overrideUri?: string): Promise<string> {
  if (mongoose.connection.readyState === 1 && connectedUri) {
    return connectedUri;
  }

  let uri = overrideUri || env.mongoUri;

  if (!overrideUri && env.useInMemoryDb) {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    uri = replSet.getUri('factoryflow');
    console.log('[DB] Started MongoMemoryReplSet (with transaction support)');
  }

  await mongoose.connect(uri, {
    autoIndex: true,
  });

  connectedUri = uri;
  console.log(`[DB] Connected to MongoDB (${env.useInMemoryDb && !overrideUri ? 'in-memory replica set' : 'external'})`);
  return uri;
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
  connectedUri = null;
}

/**
 * Runs a callback inside a Mongoose ACID transaction session.
 * Automatically retries transient transaction errors if needed and ensures abort on failure.
 */
export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
