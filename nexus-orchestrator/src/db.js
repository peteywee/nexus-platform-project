require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.NEXUS_DB_USER,
    host: process.env.NEXUS_DB_HOST,
    database: process.env.NEXUS_DB_NAME,
    password: process.env.NEXUS_DB_PASSWORD,
    port: 5432,
});

const initDb = async () => {
    try {
        // Create the tasks table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                payload JSONB NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                result JSONB,
                error TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Tasks table ensured to exist.");

        // ** NEW: Create the users table if it doesn't exist **
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Users table ensured to exist.");

    } catch (err) {
        console.error("Error initializing the database:", err);
        process.exit(1);
    }
};

const query = (text, params) => pool.query(text, params);

module.exports = {
    initDb,
    query,
};
