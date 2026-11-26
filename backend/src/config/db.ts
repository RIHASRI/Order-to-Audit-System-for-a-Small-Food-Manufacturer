import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { env } from './env';

let replSet: MongoMemoryReplSet | null = null;
let connectedUri: string | null = null;

async function startInMemoryReplSet(): Promise<string> {
  if (!replSet) {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    console.log('[DB] Started MongoMemoryReplSet (with ACID transaction support)');
  }
  return replSet.getUri('factoryflow');
}

/**
 * Connects to MongoDB Atlas (via MONGO_URI) or starts an in-memory replica set
 * so Mongoose multi-document ACID transactions work identically in local dev, tests, and production.
 */
export async function connectDB(overrideUri?: string): Promise<string> {
  if (mongoose.connection.readyState === 1 && connectedUri) {
    return connectedUri;
  }

  // If explicitly configured for in-memory DB or test environment
  if (!overrideUri && (env.useInMemoryDb || env.nodeEnv === 'test')) {
    const uri = await startInMemoryReplSet();
    await mongoose.connect(uri, { autoIndex: true });
    connectedUri = uri;
    console.log('[DB] Connected to MongoDB (in-memory replica set)');
    return uri;
  }

  const targetUri = overrideUri || env.mongoUri;

  try {
    // Attempt external connection with a 5-second timeout
    await mongoose.connect(targetUri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    connectedUri = targetUri;
    console.log('[DB] Connected to MongoDB Atlas (external cluster)');
    return targetUri;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // In non-production environments (local dev), fall back to in-memory replica set if Atlas IP is not whitelisted
    if (env.nodeEnv !== 'production' && !overrideUri) {
      console.warn(`\n[DB] ⚠️  Notice: Could not connect to external MongoDB Atlas (${message})`);
      console.warn('[DB] 💡 IP Whitelist: To connect your machine to Atlas directly, add your IP in MongoDB Atlas -> Network Access (https://cloud.mongodb.com).');
      console.warn('[DB] 🚀 Seamlessly falling back to local in-memory replica set for development...\n');

      const memUri = await startInMemoryReplSet();
      await mongoose.connect(memUri, { autoIndex: true });
      connectedUri = memUri;
      console.log('[DB] Connected to MongoDB (in-memory replica set fallback)');
      return memUri;
    }

    // In production or test override, fail explicitly
    console.error('[DB] Fatal MongoDB connection failure:', message);
    throw err;
  }
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
