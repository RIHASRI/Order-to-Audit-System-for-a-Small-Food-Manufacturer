import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/factoryflow',
  useInMemoryDb:
    process.env.USE_IN_MEMORY_DB === 'true' ||
    (!process.env.MONGO_URI && process.env.NODE_ENV !== 'production'),
  jwtSecret: process.env.JWT_SECRET || 'factoryflow-dev-secret-change-in-production-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigin:
    process.env.CORS_ORIGIN ||
    'http://localhost:5173,https://order-to-audit-system-for-a-small-food-manufacturer-p6fs4skc2.vercel.app',
  company: {
    name: process.env.COMPANY_NAME || 'FactoryFlow Foods Pvt. Ltd.',
    gstin: process.env.COMPANY_GSTIN || '33AABCF1234D1Z5',
    address:
      process.env.COMPANY_ADDRESS ||
      'Plot 42, SIDCO Industrial Estate, Tiruchirappalli, Tamil Nadu - 620015',
    state: process.env.COMPANY_STATE || 'Tamil Nadu',
    stateCode: process.env.COMPANY_STATE_CODE || '33',
    phone: process.env.COMPANY_PHONE || '+91 431 240 5500',
    email: process.env.COMPANY_EMAIL || 'billing@factoryflow.in',
  },
};
