import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// MySQL connection pool
export const dbPool = mysql.createPool({
  host: 'inskilld-dev.cfc60cwysdw2.ap-south-1.rds.amazonaws.com',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'inskilld',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
