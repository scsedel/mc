require('dotenv').config();
const WebSocket = require('ws');
const {
    Connection, Keypair, PublicKey,
    VersionedTransaction, SystemProgram, LAMPORTS_PER_SOL,
    TransactionMessage // Importante per costruire V0
} = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const axios = require('axios');
const { randomUUID } = require('crypto');

// CONFIGURAZIONE
const JITO_ENGINE_URL = "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles";
const JITO_TIP_AMOUNT = 0.01; // 0.01 SOL (Tip aggressiva per vincere asta)
const TIP_ACCOUNTS = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5", "HFqU5x63VTqvQss8hp11i4wVV8bD44PuwkqqD08CWufQ",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY", "ADaUMid9yfUytqMBgopXSjbCp5R9HqvATyDt1USorEVs"
];

const RPC_URL = process.env.RPC_URL;
const BUY_AMOUNT = 0.05;
const CONNECTION = new Connection(RPC_URL, "confirmed");
const WALLET = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
let isSnipping = false;

console.log(`🚀 SNIPER JITO V2 (PURE VERSIONED)`);
console.log(`Engine: ${JITO_ENGINE_URL}`);

const ws = new WebSocket('wss://pumpportal.fun/api/data');

ws.on('open', () => {
    console.log('✅ Socket Aperto. In attesa...');
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
});

ws.on('message', async (data) => {
    if (isSnipping) return;
    try {
        const msg = JSON.parse(data);
        if (!msg.mint) return;

        // Filtro rapido
        if ((msg.solAmount || 0) < 0.5) return;

        isSnipping = true;
        console.log(`\n💎 TARGET: ${msg.name}`);
        ws.close();
        await executeJitoBuy(msg.mint);

    } catch (e) {}
});

async function executeJitoBuy(mint) {
    console.log("⚡ Preparazione Jito Bundle V0...");

    try {
        // 1. BUY TX (Già Versioned da PumpPortal)
        const response = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                publicKey: WALLET.publicKey.toString(),
                action: "buy",
                mint: mint,
                denominatedInSol: "true",
                amount: BUY_AMOUNT,
                slippage: "50",
                priorityFee: 0.0001,
                pool: "pump"
            })
        });
        const data = await response.arrayBuffer();
        const buyTx = VersionedTransaction.deserialize(new Uint8Array(data));
        buyTx.sign([WALLET]);

        // 2. TIP TX (Costruita come V0 Versioned)
        const tipAccount = new PublicKey(TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)]);
        const { blockhash } = await CONNECTION.getLatestBlockhash("finalized");

        const tipInstruction = SystemProgram.transfer({
            fromPubkey: WALLET.publicKey,
            toPubkey: tipAccount,
            lamports: Math.floor(JITO_TIP_AMOUNT * LAMPORTS_PER_SOL),
        });

        // Compiliamo il messaggio V0
        const messageV0 = new TransactionMessage({
            payerKey: WALLET.publicKey,
            recentBlockhash: blockhash,
            instructions: [tipInstruction],
        }).compileToV0Message();

        const tipTx = new VersionedTransaction(messageV0);
        tipTx.sign([WALLET]);

        // 3. ENCODE
        const b58Buy = bs58.encode(buyTx.serialize());
        const b58Tip = bs58.encode(tipTx.serialize());

        // 4. SEND
        console.log(`📤 Invio Bundle... (Tip: ${JITO_TIP_AMOUNT} SOL)`);

        const bundleResp = await axios.post(`${JITO_ENGINE_URL}?uuid=${randomUUID()}`, {
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [[b58Buy, b58Tip]]
        });

        console.log(`✅ Jito Accepted! Bundle ID:`, bundleResp.data.result);
        process.exit(0);

    } catch (e) {
        console.error("❌ Jito Error:", e.response ? e.response.data : e.message);
        process.exit(1);
    }
}
