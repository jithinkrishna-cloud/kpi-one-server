import mysql from "mysql2";
import dotenv from "dotenv";
dotenv.config({ path: "src/config/.env" });

const db = mysql
  .createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306, // Note: user code had MY_SQL_PORT, I'll use DB_PORT for consistency or both
    ssl: {
      rejectUnauthorized: false,
    },
    waitForConnections: true,
    connectionLimit: 10,
  })
  .promise(); // ✅ Promise wrapper

export const checkDbConnection = async () => {
  try {
    const [rows] = await db.query("SELECT 1");
    console.log("✅ Database connection is active.");
    return true;
  } catch (err) {
    console.error("❌ Database connection failed: ", err.message);
    throw err;
  }
};

export default db;
