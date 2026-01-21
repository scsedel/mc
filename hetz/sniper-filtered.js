require('dotenv').config();
const WebSocket = require('ws');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
// const fetch = require('node-fetch');

// CONFIG
const RPC_URL = process.env.RPC_URL;
const BUY_AMOUNT = 0.03;
const BUY_TIP = 0.01;
const GAS_FEE = 0.01;
const CONNECTION = new Connection(RPC_URL, "confirmed");
const WALLET = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
let isSnipping = false;

console.log(`🛡️ SNIPER ONE-SHOT CON FILTRO SOCIAL (DEBUG MODE)`);
console.log(`Server: Hetzner Ashburn | Wallet: ${WALLET.publicKey.toString()}`);

const ws = new WebSocket('wss://pumpportal.fun/api/data');

ws.on('open', () => {
    console.log('✅ Connesso al socket. In attesa di feed...');
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));

    // Heartbeat log ogni 30s
    setInterval(() => {
        if (!isSnipping) console.log(`[${new Date().toLocaleTimeString()}] 💓 Bot attivo e in ascolto...`);
    }, 30000);
});

ws.on('message', async (data) => {
    if (isSnipping) return;
    try {
        const msg = JSON.parse(data);
        if (!msg.mint) return;

        // DEBUG: Stampa cosa stiamo analizzando
        const hasSocials = (msg.twitter || msg.telegram || msg.website);
        const socialStr = `${msg.twitter ? 'TW ' : ''}${msg.telegram ? 'TG ' : ''}${msg.website ? 'WEB' : ''}`;

        // --- NUOVO FILTRO: DEV BUY ---
        // I social non ci sono nel payload immediato.
        // Usiamo i soldi come proxy della qualità.

        const devSpend = msg.solAmount || 0;
        const MIN_DEV_SPEND = 0.5; // Almeno 0.5 SOL (circa 80-100$)

        console.log(`🔎 CHECK: ${msg.mint} - ${msg.name} | Dev Spend: ${devSpend.toFixed(3)} SOL`);

        if (devSpend < MIN_DEV_SPEND) {
            console.log(`🗑️ SCARTATO: Spend troppo basso.`);
            return;
        }

        // SE SIAMO QUI, IL DEV HA MESSO SOLDI VERI

        // TOKEN TROVATO
        isSnipping = true;
        console.log(`\n💎 TARGET TROVATO: ${msg.name} (${msg.symbol})`);
        console.log(`   Mint: ${msg.mint}`);
        console.log(`   Socials: ${socialStr}`);
        ws.close();

        await executeAggressiveCycle(msg.mint);

    } catch (e) {
        console.error("Parse Error:", e);
    }
});

async function executeAggressiveCycle(mint) {
    console.log("⚡ Invio BUY...");
    const buySig = await executeTrade(mint, "buy", BUY_AMOUNT);

    if (!buySig) {
        console.error("❌ Buy fallito (RPC Error o Insufficient Funds). Esco.");
        process.exit(1);
    }
    console.log(`✅ Buy Sent: https://solscan.io/tx/${buySig}`);

    console.log("🔄 Inizio SPAM VENDITA...");

    let sold = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 40;

    while (!sold && attempts < MAX_ATTEMPTS) {
        attempts++;
        await new Promise(r => setTimeout(r, 500));
        process.stdout.write(`\r[Sell Attempt #${attempts}] `);

        const sellSig = await executeTrade(mint, "sell", "100%");
        if (sellSig) {
            console.log(`\n🎉 VENDUTO! TX: https://solscan.io/tx/${sellSig}`);
            sold = true;
            process.exit(0);
        }
    }

    if (!sold) console.error("\n❌ Timeout Vendita. Controlla wallet!");
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
                priorityFee: BUY_TIP,
                pool: "pump"
            })
        });

        if (response.status !== 200) {
            // Se fallisce (es. 400 Bad Request), logga il perché solo se è BUY
            // Per il SELL, il 400 è normale finché non hai i token, quindi lo ignoriamo
            const errorText = await response.text(); // Leggiamo cosa dice il server
            console.error(`❌ API Error (${action}): ${response.status} - ${errorText}`);
            // if (action === 'buy') console.error(`API Error: ${response.status} ${await response.text()}`);
            return null;
        }

        const data = await response.arrayBuffer();
        const tx = VersionedTransaction.deserialize(new Uint8Array(data));
        tx.sign([WALLET]);

        const signature = await CONNECTION.sendRawTransaction(tx.serialize(), {
            skipPreflight: true,
            maxRetries: 0
        });

        return signature;
    } catch (e) {
        console.error(`❌ CRITICAL EXCEPTION (${action}):`, e); // Stampa tutto lo stack trace
        return null;
    }
}
