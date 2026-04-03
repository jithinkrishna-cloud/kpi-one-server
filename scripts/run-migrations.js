import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', 'src', 'config', '.env') });

const runMigrations = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const migrationsDir = path.join(__dirname, '..', 'src', 'database', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`🚀 Found ${files.length} migrations...`);

    for (const file of files) {
      console.log(`📄 Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      // Execute each statement (splitting by semicolon to handle multi-statement files)
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      
      for (const statement of statements) {
        try {
          await connection.query(statement);
        } catch (err) {
          // If it's a "Duplicate column name" error, we can skip it
          if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_TABLE_EXISTS_ERROR') {
            continue;
          }
          throw err;
        }
      }
    }
    
    console.log('✅ All migrations completed successfully.');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await connection.end();
  }
};

runMigrations();
