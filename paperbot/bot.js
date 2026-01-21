require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const express = require('express');

// --- CONFIGURAZIONE ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const connection = new Connection(process.env.HELIUS_RPC);
const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const SOL_MINT = 'So11111111111111111111111111111111111111111';

// Stato in memoria
let positions = {}; // { mint: { entry_sol, entry_time, last_active, token_amount } }

// --- 1. WEBHOOK SERVER (Riceve nuovi token) ---
const app = express();
app.use(express.json());

// console.log(app);

app.post('/webhook-launches', async (req, res) => {
    const events = req.body;
    console.log(events);

    if (!events) return res.sendStatus(200);

    // Se ricevi un oggetto singolo invece di un array, mettilo in array
    const eventList = Array.isArray(events) ? events : [events];


    for (const event of eventList) {
        // 1. IGNORA LE TRANSAZIONI FALLITE
        if (event.meta && event.meta.err) {
            // console.log('Skipping failed transaction');
            continue;
        }

        // 2. Estrai Mint (con la funzione aggiornata che ti ho dato prima)
        const mint = extractMint(event);

        if (!mint) {
            // console.log('No mint found in transaction');
            continue;
        }

        // 3. Verifica se è una CREATE (Nuovo Lancio)
        // Cerca "Instruction: Create" nei log
        const isCreate = event.meta?.logMessages?.some(log =>
            log.includes('Program log: Instruction: Create')
        );

        // Se vuoi catturare SOLO i lanci veri:
        if (!isCreate) continue;

        // Se sei arrivato qui, è un lancio valido e riuscito!
        if (!positions[mint]) {
            const mc = await getMarketCap(mint);

            if (mc >= 4000) {
                // ... logica di acquisto ...
                console.log(`[BUY SIM] ${mint} (MC: $${mc.toFixed(0)})`);
                // ...
            }
        }
    }
    res.sendStatus(200);
});


// --- 2. MONITORING LOOP (Core Logic 400ms) ---
setInterval(async () => {
    const mints = Object.keys(positions);
    if (mints.length === 0) return;

    for (const mint of mints) {
        const pos = positions[mint];
        try {
            // A. Recupera Pool Address (Bonding Curve)
            const pool = await getBondingCurvePDA(mint);

            // B. Controlla ultime transazioni (Exit Reason: FIRST_SELL)
            const signatures = await connection.getSignaturesForAddress(pool, { limit: 5 });
            const has_sell = signatures.some(sig => checkSellLog(sig));

            // C. Calcola PnL Corrente (Exit Reason: TP 1%)
            const curr_price = await getPriceInSol(mint);
            const curr_value = pos.token_amount * curr_price;
            const pnl_pct = (curr_value - pos.entry_sol) / pos.entry_sol;

            // D. Controlla Inattività (Exit Reason: NO_ACTIVITY > 2s)
            // Aggiorna last_active se c'è una tx recente (meno di 2 sec fa)
            if (signatures.length > 0 && (Date.now()/1000 - signatures[0].blockTime) < 2) {
                pos.last_active = Date.now();
            }
            const idle_sec = (Date.now() - pos.last_active) / 1000;

            // --- E. LOGICA DI EXIT ---
            let exit_reason = null;

            if (pnl_pct >= 0.01) exit_reason = 'TP_1%';
            else if (has_sell) exit_reason = 'FIRST_SELL';
            else if (idle_sec > 2) exit_reason = 'NO_ACTIVITY';

            if (exit_reason) {
                const pnl_sol_net = curr_value - pos.entry_sol - 0.025; // Fee stimate

                // Log su Console
                console.log(`[SELL SIM] ${mint} | Reason: ${exit_reason} | PnL: ${pnl_pct.toFixed(2)}%`);

                // Log su Supabase
                await supabase.from('paper_trades').insert({
                    token_mint: mint,
                    entry_sol: pos.entry_sol,
                    pnl_sol: pnl_sol_net,
                    pnl_pct: pnl_pct * 100,
                    hold_sec: (Date.now() - pos.entry_time) / 1000,
                    exit_reason: exit_reason
                });

                delete positions[mint]; // Chiudi posizione
            }

        } catch (e) {
            console.error(`Err monitor ${mint}:`, e.message);
        }
    }
}, 400);

// --- HELPER FUNCTIONS ---

async function getBondingCurvePDA(mint) {
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bonding_curve"), new PublicKey(mint).toBuffer()],
        PUMP_PROGRAM
    );
    return pda;
}

async function getPriceInSol(mint) {
    // Usa Jupiter API per prezzo reale
    try {
        const url = `${process.env.JUPITER_QUOTE}/quote?inputMint=${mint}&outputMint=${SOL_MINT}&amount=1000000&slippageBps=50`;
        const { data } = await axios.get(url);
        // Prezzo unitario approssimativo derivato dalla quote
        if (data.outAmount) {
            return (data.outAmount / 1e9) / (1000000 / 1e6); // Normalizzato
        }
    } catch (e) {
        // Fallback: se Jupiter non ha ancora il token (troppo nuovo), ritorna prezzo entry fittizio
        // per evitare crash, o usa bonding curve math (complesso qui)
        if (positions[mint]) return positions[mint].entry_price;
    }
    return 0.00003; // Fallback generico basso
}

async function getMarketCap(mint) {
    // Stima veloce: Supply pump.fun è sempre 1B all'inizio
    const price = await getPriceInSol(mint);
    const sol_price = 150; // Hardcoded o fetch da API
    return (price * 1_000_000_000) * sol_price;
}

function checkSellLog(sig) {
    // Controlla se nei log c'è un'istruzione di vendita o transfer out
    if (!sig.err && sig.memo === null) return false; // Semplificazione
    // Implementazione reale richiede getTransaction con 'maxSupportedTransactionVersion: 0'
    // Qui assumiamo che se c'è una nuova tx sulla bonding curve non nostra, è un rischio
    return true;
}

function extractMint(event) {
    // Caso 1: Payload Enhanced (se mai dovesse arrivare)
    if (event.tokenMint) return event.tokenMint;
    if (event.tokenTransfers && event.tokenTransfers.length > 0) return event.tokenTransfers[0].mint;

    // Caso 2: Payload Raw (quello che stai ricevendo ora)
    if (event.meta && event.meta.postTokenBalances) {
        // Cerca nei bilanci dei token post-transazione
        for (const balance of event.meta.postTokenBalances) {
            // Ignora Wrapped SOL (So111...) e cerca l'altro token
            if (balance.mint && balance.mint !== 'So11111111111111111111111111111111111111112') {
                return balance.mint;
            }
        }
    }

    // Caso 3: Fallback se non lo trova nei balances (es. transazione fallita o solo SOL)
    // Parsing dei log (metodo brutale ma efficace per le Create)
    if (event.meta && event.meta.logMessages) {
        // Nelle 'Create', il mint è spesso il token creato.
        // Ma per ora affidiamoci ai balances che è più sicuro.
    }

    return null;
}


// Avvio server
const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`Bot Paper Trading attivo su port ${PORT}`));
