const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Pool Supabase con DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Test connessione DB
async function testDbConnection() {
    try {
        const res = await pool.query('SELECT NOW() as time, version() as pg_version');
        const stats = await pool.query('SELECT COUNT(*) as count FROM token_stats');

        return {
            success: true,
            time: res.rows[0].time,
            pgVersion: res.rows[0].pg_version,
            tokenStats: stats.rows[0].count,
            databaseUrlSet: !!process.env.DATABASE_URL
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            databaseUrlSet: !!process.env.DATABASE_URL
        };
    }
}

// Endpoint test DB
app.get('/api/test-db', async (req, res) => {
    const result = await testDbConnection();
    res.json(result);
});

// Endpoint restart app (Plesk/Phusion Passenger)
app.post('/api/restart-app', (req, res) => {
    try {
        // Crea tmp/restart.txt per triggerare restart Plesk
        const restartFile = path.join(__dirname, 'tmp', 'restart.txt');
        fs.mkdirSync(path.dirname(restartFile), { recursive: true });
        fs.writeFileSync(restartFile, new Date().toISOString());

        res.json({ success: true, message: 'App riavviata! Le variabili d\'ambiente sono state refreshate.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Pagina principale
app.get('/', async (req, res) => {
    const dbStatus = await testDbConnection();
    res.render('index', { dbStatus });
});

app.listen(PORT, () => {
    console.log(`🚀 Server attivo su porta ${PORT}`);
    console.log(`🌐 Testa qui: http://mc.bitsans.com:${PORT}`);
});
