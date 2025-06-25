require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.NEXUS_DB_USER,
    host: process.env.NEXUS_DB_HOST,
    database: process.env.NEXUS_DB_NAME,
    password: process.env.NEXUS_DB_PASSWORD,
    port: 5432, // Default PostgreSQL port
});

const initDb = async () => {
    try {
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
    } catch (err) {
        console.error("Error initializing the database:", err);
        // It's critical that the DB is ready for the app to function.
        // In a production setup, you might have robust retry logic or health checks.
        // For this manual, we'll exit to indicate immediate failure.
        process.exit(1);
    }
};

const query = (text, params) => pool.query(text, params);

module.exports = {
    initDb,
    query,
};
