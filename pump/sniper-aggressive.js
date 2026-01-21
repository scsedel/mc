require('dotenv').config();
const WebSocket = require('ws');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const fetch = require('node-fetch');

// CONFIG
const RPC_URL = process.env.RPC_URL;
const BUY_AMOUNT = 0.05;
const CONNECTION = new Connection(RPC_URL, "confirmed");
const WALLET = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
let isSnipping = false;

console.log(`🔥 SNIPER AGGRESSIVO ATTIVO`);

const ws = new WebSocket('wss://pumpportal.fun/api/data');

ws.on('open', () => {
    console.log('✅ In attesa di prede...');
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
});

ws.on('message', async (data) => {
    if (isSnipping) return;
    try {
        const msg = JSON.parse(data);
        if (!msg.mint) return;

        isSnipping = true;
        console.log(`\n🚀 TARGET: ${msg.name} (${msg.symbol})`);
        ws.close();

        await executeAggressiveCycle(msg.mint);
    } catch (e) {}
});

async function executeAggressiveCycle(mint) {
    // 1. BUY (One Shot)
    console.log("⚡ Invio BUY...");
    const buySig = await executeTrade(mint, "buy", BUY_AMOUNT);

    if (!buySig) {
        console.error("❌ Buy fallito. Stop.");
        process.exit(1);
    }
    console.log(`✅ Buy Sent: https://solscan.io/tx/${buySig}`);

    // 2. SELL LOOP (SPAM)
    // Non aspettiamo conferme. Iniziamo a provare a vendere subito.
    console.log("🔄 Inizio SPAM VENDITA (Aggressive Mode)...");

    let sold = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // Prova per circa 10-15 secondi max

    while (!sold && attempts < MAX_ATTEMPTS) {
        attempts++;
        // Delay minimo per non essere bannati dall'API di PumpPortal (rate limit)
        await new Promise(r => setTimeout(r, 800));

        console.log(`[Tentativo Sell #${attempts}]`);

        // Proviamo a vendere il 100%
        const sellSig = await executeTrade(mint, "sell", "100%");

        if (sellSig) {
            console.log(`🎉 VENDUTO AL TENTATIVO ${attempts}!`);
            console.log(`🔗 TX: https://solscan.io/tx/${sellSig}`);
            sold = true;
            process.exit(0);
        }
        // Se fallisce (es. "Insufficient funds"), il loop continua e riprova
    }

    if (!sold) console.error("❌ Impossibile vendere dopo vari tentativi. Controlla manualmente.");
    process.exit(1);
}

async function executeTrade(mint, action, amount) {
    try {
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
                priorityFee: 0.015, // Alta fee per entrare subito
                pool: "pump"
            })
        });

        if (response.status !== 200) {
            // Non stampiamo errore completo nel loop per pulizia, solo codice
            // (Spesso sarà 400 "Insufficient Funds" finché il buy non è confermato)
            // console.error(`API ${response.status}`);
            return null;
        }

        const data = await response.arrayBuffer();
        const tx = VersionedTransaction.deserialize(new Uint8Array(data));
        tx.sign([WALLET]);

        const signature = await CONNECTION.sendRawTransaction(tx.serialize(), {
            skipPreflight: true, // FONDAMENTALE: Salta la simulazione che fallirebbe per "no funds"
            maxRetries: 0 // Inviamo e dimentichiamo, se fallisce riproviamo col loop
        });

        return signature;
    } catch (e) {
        return null;
    }
}
