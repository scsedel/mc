require('dotenv').config();
const WebSocket = require('ws');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const axios = require('axios'); // Serve per chiamare l'API di PumpPortal per la tx

// CONFIGURAZIONE
const JITO_BLOCK_ENGINE_URL = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const TIP_ACCOUNTS = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PuwkqqD08CWufQ",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopXSjbCp5R9HqvATyDt1USorEVs",
    "DfXygSm4jCyNCyb3qzK6966vGyo2hPS30TT24586J939",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnIzKZ6jJ",
    "ADuUkR4ykGytmnb5SM9ID6FjbhHsGbYy9WtkU1wnQ44n",
    "DttWaMuVvTiduZRNgLcGW9t66tePvm6odEU17mn3XRxd"
];
const BUY_AMOUNT_SOL = 0.02; // Quanto vuoi spendere per ogni snipe
const MIN_DEV_BUY = 0.5;    // Filtro dev

// SETUP WALLET
const connection = new Connection(process.env.RPC_URL);
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
console.log(`🔫 Sniper Wallet: ${wallet.publicKey.toString()}`);

// WEBSOCKET
const ws = new WebSocket('wss://pumpportal.fun/api/data');

ws.on('open', function open() {
    console.log('✅ Connesso. In attesa di prede...');
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
});

ws.on('message', async function incoming(data) {
    try {
        const message = JSON.parse(data);
        if (!message.mint) return;

        // Eseguiamo i filtri veloci
        // (Nota: in produzione questo deve essere istantaneo, qui stampiamo per debug)

        // Logica fittizia per rilevare "Dev Buy" (nella realtà dovresti parsare initialBuy se disponibile o fidarti del Bundle)
        // Per ora assumiamo che VOGLIAMO comprare tutto quello che passa per testare la velocità Jito

        console.log(`🚀 NEW TOKEN: ${message.name} | ${message.mint}`);

        // --- INIZIO PROCEDURA DI ACQUISTO (JITO) ---
        await executeJitoSnipe(message.mint);

    } catch (e) {
        console.error("Errore:", e);
    }
});

async function executeJitoSnipe(mintAddress) {
    console.log("⚡ Preparazione Jito Bundle per:", mintAddress);

    try {
        // 1. Ottieni la transazione di acquisto da PumpPortal (è il modo più veloce per non costruirla a mano)
        // In produzione, costruiscila localmente per risparmiare 200ms di latenza HTTP!
        const response = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                publicKey: wallet.publicKey.toString(),
                action: "buy",
                mint: mintAddress,
                amount: BUY_AMOUNT_SOL,
                denominatedInSol: "true",
                slippage: 50, // Slippage alto per snipe
                priorityFee: 0.0001,
                pool: "pump"
            })
        });

        if(response.status !== 200) {
            console.error("Errore API PumpPortal");
            return;
        }

        const data = await response.arrayBuffer();
        const tx = Transaction.from(new Uint8Array(data)); // Deserializza transazione

        // 2. Crea la TIP Transaction (la mancia per Jito)
        const tipAccount = new PublicKey(TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)]);
        const tipTx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: tipAccount,
                lamports: process.env.JITO_FEE * LAMPORTS_PER_SOL,
            })
        );

        // 3. Recupera l'ultimo Blockhash (Essenziale!)
        const { blockhash } = await connection.getLatestBlockhash("finalized");
        tx.recentBlockhash = blockhash;
        tipTx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;
        tipTx.feePayer = wallet.publicKey;

        // 4. Firma entrambe le transazioni
        tx.sign(wallet);
        tipTx.sign(wallet);

        // 5. Codifica in Base58 e crea il Bundle
        const b58Tx = bs58.encode(tx.serialize());
        const b58Tip = bs58.encode(tipTx.serialize());

        console.log("📤 Invio Bundle a Jito...");

        // 6. Invia al Block Engine
        const bundleResp = await axios.post(JITO_BLOCK_ENGINE_URL, {
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [[b58Tx, b58Tip]] // Ordine: [Tuo Acquisto, Mancia]
        });

        console.log("✅ Jito Risposta:", bundleResp.data);

    } catch (err) {
        console.error("❌ Errore Snipe:", err.message);
    }
}
