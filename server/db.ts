
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Parse the DATABASE_URL to extract connection details
const url = new URL(process.env.DATABASE_URL);

// Configure MySQL connection pool with proper settings
export const connection = mysql.createPool({
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1), // Remove leading slash
  ssl: {
    rejectUnauthorized: false
  },
  connectionLimit: 10,
  queueLimit: 0,
  reconnect: true,
  acquireTimeout: 60000,
  timeout: 60000,
});

export const db = drizzle(connection, { 
  schema,
  mode: "default"
});
