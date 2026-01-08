const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function test() {
    try {
        const res = await pool.query('SELECT NOW() as time, version() as pg_version');
        console.log('✅ CONNESSIONE OK!');
        console.log('Tempo server:', res.rows[0].time);
        console.log('Postgres version:', res.rows[0].pg_version);

        // Test tabella token_stats
        const stats = await pool.query('SELECT COUNT(*) as count FROM token_stats');
        console.log('Token stats rows:', stats.rows[0].count);

    } catch (error) {
        console.error('❌ ERRORE:', error.message);
    } finally {
        await pool.end();
    }
}

test();