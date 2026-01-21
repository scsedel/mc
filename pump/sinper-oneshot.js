require('dotenv').config();
const WebSocket = require('ws');
const {
    Connection,
    Keypair,
    VersionedTransaction,
    PublicKey
} = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const fetch = require('node-fetch');

// --- CONFIGURAZIONE ---
const RPC_URL = process.env.RPC_URL; // Assicurati sia Helius nel .env
const BUY_AMOUNT = 0.05; // SOL da investire
const SELL_DELAY = 4000; // 4 secondi (2s potrebbero essere pochi per la conferma on-chain del buy)

// FLAG DI STATO (Per assicurarsi che si fermi dopo il primo)
let isSnipping = false;

// SETUP
if (!RPC_URL) { console.error("❌ Manca RPC_URL nel file .env"); process.exit(1); }
const CONNECTION = new Connection(RPC_URL, "confirmed");
const WALLET = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));

console.log(`🎯 SNIPER ONE-SHOT ATTIVO`);
console.log(`Wallet: ${WALLET.publicKey.toString()}`);
console.log(`Target: Il PRIMO token che esce...`);

// WEBSOCKET
const ws = new WebSocket('wss://pumpportal.fun/api/data');

ws.on('open', function open() {
    console.log('✅ In ascolto...');
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
});

ws.on('message', async function incoming(data) {
    // Se stiamo già lavorando su un token, ignoriamo tutto il resto
    if (isSnipping) return;

    try {
        const message = JSON.parse(data);
        if (!message.mint) return;

        // --- TROVATO! ---
        isSnipping = true; // Blocca altri token
        console.log(`\n🔥 TOKEN RILEVATO: ${message.name} (${message.symbol})`);
        console.log(`   Mint: ${message.mint}`);

        // Chiudiamo il socket per non ricevere altro rumore
        ws.close();

        // AVVIO CICLO BUY -> WAIT -> SELL
        await runOneShotCycle(message.mint);

    } catch (e) {
        console.error("Errore parsing:", e);
        // Se errore grave, riapri il flag? No, per one-shot meglio fermarsi e controllare.
    }
});

async function runOneShotCycle(mint) {
    // 1. BUY
    const buySig = await executeTrade(mint, "buy", BUY_AMOUNT);

    if (!buySig) {
        console.error("❌ Buy fallito. Termino script senza vendere.");
        process.exit(1);
    }

    // 2. WAIT
    console.log(`⏳ Attesa ${SELL_DELAY/1000}s per conferma e inattività...`);
    await new Promise(r => setTimeout(r, SELL_DELAY));

    // 3. CHECK BALANCE (Verifica se il Buy è entrato davvero)
    const balance = await checkBalance(mint);
    if (balance <= 0) {
        console.error("❌ Saldo 0 dopo l'attesa. Il Buy non è stato confermato in tempo.");
        process.exit(1);
    }
    console.log(`💰 Saldo rilevato: ${balance}. VENDO TUTTO.`);

    // 4. SELL
    const sellSig = await executeTrade(mint, "sell", "100%"); // "100%" dice all'API di vendere tutto

    if (sellSig) {
        console.log("🏆 CICLO COMPLETATO. Script terminato.");
    } else {
        console.error("⚠️ Sell fallito. Controlla il wallet manualmente!");
    }

    process.exit(0);
}

async function executeTrade(mint, action, amount) {
    try {
        console.log(`⚡ Sending ${action.toUpperCase()}...`);

        const response = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                publicKey: WALLET.publicKey.toString(),
                action: action,
                mint: mint,
                denominatedInSol: action === 'buy' ? "true" : "false",
                amount: amount,
                slippage: "50",
                priorityFee: 0.015, // Fee molto aggressiva per Helius
                pool: "pump"
            })
        });

        if (response.status !== 200) {
            console.error(`❌ API Error (${action}):`, await response.text());
            return null;
        }

        const data = await response.arrayBuffer();
        const tx = VersionedTransaction.deserialize(new Uint8Array(data));
        tx.sign([WALLET]);

        // Invio RPC
        const signature = await CONNECTION.sendRawTransaction(tx.serialize(), {
            skipPreflight: true,
            maxRetries: 5,
        });

        console.log(`✅ ${action} TX: https://solscan.io/tx/${signature}`);
        return signature;

    } catch (e) {
        console.error(`❌ Exec Error (${action}):`, e.message);
        return null;
    }
}

async function checkBalance(mint) {
    try {
        const accounts = await CONNECTION.getParsedTokenAccountsByOwner(
            WALLET.publicKey, { mint: new PublicKey(mint) }
        );
        return accounts.value.length ? accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount : 0;
    } catch (e) {
        return 0;
    }
}
