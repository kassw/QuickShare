
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

// Validate required environment variables
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
  throw new Error(
    "Database connection parameters must be set. Check DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME environment variables.",
  );
}

export const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? {} : false,
};
