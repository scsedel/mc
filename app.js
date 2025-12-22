const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

// Pool Supabase
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Test DB
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

// API endpoints
app.get('/api/test-db', async (req, res) => {
    const result = await testDbConnection();
    res.json(result);
});

app.post('/api/restart-app', (req, res) => {
    try {
        const restartFile = path.join(__dirname, 'tmp', 'restart.txt');
        fs.mkdirSync(path.dirname(restartFile), { recursive: true });
        fs.writeFileSync(restartFile, new Date().toISOString());
        res.json({ success: true, message: 'App riavviata! Variabili refreshate.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Pagina principale HTML PURO (NO EJS!)
app.get('/', async (req, res) => {
    const dbStatus = await testDbConnection();

    const html = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Supabase & Refresh Env Plesk</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .status { padding: 15px; border-radius: 8px; margin: 10px 0; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        button { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; margin: 5px; }
        button:hover { background: #0056b3; }
        button:disabled { background: #6c757d; cursor: not-allowed; }
        .env-info { background: #e9ecef; padding: 15px; border-radius: 6px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>🧪 Test Supabase DB & Refresh Variabili Plesk</h1>
    
    <div class="env-info">
        <strong>DATABASE_URL impostata:</strong> ${dbStatus.databaseUrlSet ? '✅ SÌ' : '❌ NO'}<br>
        <small>Se NO, aggiungi DATABASE_URL in Plesk > Node.js > Custom Environment Variables</small>
    </div>

    <h2>Test Connessione DB</h2>
    ${dbStatus.success ? `
        <div class="status success">
            ✅ <strong>CONNESSIONE MOLTO OK!</strong><br>
            Tempo server: ${dbStatus.time}<br>
            PostgreSQL: ${dbStatus.pgVersion}<br>
            Token stats: ${dbStatus.tokenStats} righe
        </div>
    ` : `
        <div class="status error">
            ❌ <strong>ERRORE CONNESSIONE:</strong><br>
            ${dbStatus.error}<br>
            <small>Verifica DATABASE_URL in Plesk e riavvia l'app</small>
        </div>
    `}

    <button id="testBtn">🔄 Ritest DB</button>
    <button id="restartBtn">♻️ Refresh Variabili & Restart App</button>

    <script>
        document.getElementById('testBtn').addEventListener('click', async function() {
            this.disabled = true;
            this.textContent = 'Testando...';
            try {
                const res = await fetch('/api/test-db');
                const data = await res.json();
                location.reload();
            } catch (error) {
                alert('Errore: ' + error.message);
            } finally {
                this.disabled = false;
                this.textContent = '🔄 Ritest DB';
            }
        });

        document.getElementById('restartBtn').addEventListener('click', async function() {
            if (!confirm('Riavviare l\\'app Node.js?\\n\\nLe nuove variabili verranno caricate.')) return;
            this.disabled = true;
            this.textContent = 'Riavvio...';
            try {
                const res = await fetch('/api/restart-app', { method: 'POST' });
                const data = await res.json();
                alert(data.message);
                setTimeout(() => location.reload(), 2000);
            } catch (error) {
                alert('Errore: ' + error.message);
            }
        });
    </script>
</body>
</html>`;

    res.send(html);
});

app.listen(PORT, () => {
    console.log('🚀 Server su porta ${PORT}');
});
