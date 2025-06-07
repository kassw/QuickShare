
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from "@shared/schema";
import { dbConfig } from './env';

// Configure MySQL connection pool with individual parameters
export const connection = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
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
