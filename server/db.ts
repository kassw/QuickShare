
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from "@shared/schema";

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
  throw new Error(
    "Database connection parameters must be set. Check DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME environment variables.",
  );
}

// Configure MySQL connection pool with individual parameters
export const connection = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  },
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
});

export const db = drizzle(connection, { 
  schema,
  mode: "default"
});
