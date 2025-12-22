const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const {
    testNewPumpfunTokens,
    getPumpfunTokenStats,
    getPumpfunTokenVolume,
} = require('./core/bitqueryClient');

const { getDevBalance } = require('./core/devChecker');

// Stato in memoria per i candidati
let currentCandidates = [];
let lastFeedUpdate = null;

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
            ✅ <strong>CONNESSIONE MOLTO MOLTO OK!</strong><br>
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

// Test Bitquery: ultimi token Pump.fun
app.get('/api/test-bitquery', async (req, res) => {
    try {
        const tokens = await testNewPumpfunTokens();
        res.json({
            success: true,
            count: tokens.length,
            tokens,
        });
    } catch (error) {
        console.error('Errore test Bitquery:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Dettagli Pump.fun per un singolo mint
app.get('/api/test-pumpfun-stats', async (req, res) => {
    const { mint } = req.query;

    if (!mint) {
        return res.status(400).json({
            success: false,
            error: 'Parametro "mint" mancante. Usa ?mint=<mintAddress>',
        });
    }

    try {
        const [stats, volume] = await Promise.all([
            getPumpfunTokenStats(mint.trim()),
            getPumpfunTokenVolume(mint.trim()),
        ]);

        res.json({
            success: true,
            stats: {
                ...stats,
                volume24hUsd: volume.volume24hUsd,
            },
        });
    } catch (error) {
        console.error('Errore test Pumpfun stats:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Test saldo DEV per un token (usa Helius)
app.get('/api/test-dev-balance', async (req, res) => {
    const { mint, dev } = req.query;

    if (!mint || !dev) {
        return res.status(400).json({
            success: false,
            error: 'Parametri "mint" e "dev" obbligatori. Usa ?mint=<mintAddress>&dev=<devAddress>',
        });
    }

    try {
        const balance = await getDevBalance(mint.trim(), dev.trim());
        const hasSoldAll = balance === 0;

        res.json({
            success: true,
            mint: mint.trim(),
            dev: dev.trim(),
            devBalance: balance,
            hasSoldAll,
        });
    } catch (error) {
        console.error('Errore test dev balance:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

async function updateCandidatesFeed() {
    try {
        console.log('🔄 Aggiornamento feed candidati...');

        const tokens = await testNewPumpfunTokens();
        console.log('📥 Token Pump.fun (Age < 1h):', tokens.length);

        const results = [];

        for (const t of tokens) {
            const mint = t.mintAddress;
            const dev = t.devAddress;

            console.log('➡️  Valuto token:', mint, 'dev:', dev);

            if (!mint || !dev) {
                console.log('   ⛔ mint o dev mancante, salto');
                continue;
            }

            try {
                const stats = await getPumpfunTokenStats(mint);
                console.log('   📊 Stats:', {
                    bondingCurve: stats.bondingCurveProgress,
                });

                const vol = await getPumpfunTokenVolume(mint);
                console.log('   💰 Volume24hUsd:', vol.volume24hUsd);

                const devBalance = await getDevBalance(mint, dev);
                console.log('   👤 DevBalance:', devBalance);

                const bondingCurve = stats.bondingCurveProgress ?? 0;
                const volume24hUsd = vol.volume24hUsd ?? 0;

                const ageOk = t.ageMinutes != null && t.ageMinutes < 60;
                const bondingOk = bondingCurve > 95.3;
                const volumeOk = volume24hUsd > 59000;
                const devSoldOut = devBalance === 0;

                console.log('   ✅ Filtri:', { ageOk, bondingOk, volumeOk, devSoldOut });

                if (ageOk && bondingOk && volumeOk && devSoldOut) {
                    results.push({
                        mint,
                        name: t.name ?? stats.name,
                        symbol: t.symbol ?? stats.symbol,
                        ageMinutes: t.ageMinutes,
                        devAddress: dev,
                        bondingCurveProgress: bondingCurve,
                        volume24hUsd,
                        devBalance,
                        priceUsd: stats.priceUsd ?? null,
                        liquidityUsd: stats.liquidityUsd ?? null,
                        metadataUri: t.metadataUri ?? null,
                        programAddress: t.programAddress ?? null,
                    });
                }
            } catch (innerErr) {
                console.error(`   ❌ Errore valutando token ${mint}:`, innerErr.message);
            }
        }

        currentCandidates = results;
        lastFeedUpdate = new Date().toISOString();

        console.log(`✅ Feed aggiornato, candidati: ${currentCandidates.length}`);
    } catch (error) {
        console.error('❌ Errore aggiornamento feed candidati (outer):', error.message);
    }
}

// Avvia aggiornamento periodico del feed (ogni 30 secondi, ad esempio)
const FEED_INTERVAL_MS = 30000;

setInterval(() => {
    updateCandidatesFeed().catch((err) => {
        console.error('Errore nel loop feed:', err.message);
    });
}, FEED_INTERVAL_MS);

// Primo aggiornamento all’avvio
updateCandidatesFeed().catch((err) => {
    console.error('Errore primo update feed:', err.message);
});

app.get('/api/feed-candidates', (req, res) => {
    res.json({
        success: true,
        updatedAt: lastFeedUpdate,
        count: currentCandidates.length,
        candidates: currentCandidates,
    });
});

app.listen(PORT, () => {
    console.log('🚀 Server su porta ${PORT}');
});
