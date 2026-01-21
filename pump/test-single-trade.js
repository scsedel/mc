require('dotenv').config();
const {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    VersionedTransaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
    ComputeBudgetProgram
} = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const axios = require('axios');
const { randomUUID } = require('crypto');

// --- CONFIGURAZIONE ---
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WS_JITO_URL = "https://api.nextblock.io/v1/bundle";
const BUY_AMOUNT_SOL = 0.03; // Amount per il test
const JITO_FEE = 0.001;      // Mancia Jito
const SELL_PRIORITY_FEE = 100000; // MicroLamports per Priority Fee Standard (Alta)

// SETUP
const connection = new Connection(RPC_URL, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));

// Jito Tip Accounts (Statici)
const TIP_ACCOUNTS = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5", "HFqU5x63VTqvQss8hp11i4wVV8bD44PuwkqqD08CWufQ",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY", "ADaUMid9yfUytqMBgopXSjbCp5R9HqvATyDt1USorEVs"
];

// --- TOKEN DA TESTARE ---
// Incolla qui il Mint Address fresco preso da Pump.fun
const MINT_TO_TEST = "BW2Y3eW6nsEZ32BDyo6ThcGSCsGXsnyBD9kchZX8pump";

async function main() {
    console.log("🚀 AVVIO TEST SNIPER IBRIDO");
    console.log(`Wallet: ${wallet.publicKey.toString()}`);
    console.log(`Target: ${MINT_TO_TEST}`);

    // 1. BUY con JITO
    console.log("\n--- FASE 1: ACQUISTO (JITO) ---");
    const buySuccess = await executeJitoBuy(MINT_TO_TEST, BUY_AMOUNT_SOL);

    if (!buySuccess) {
        console.error("❌ Acquisto fallito. Stop.");
        return;
    }

    // 2. ATTESA (Simulazione Holding)
    console.log("\n⏳ Attesa tattica 15 secondi...");
    await new Promise(r => setTimeout(r, 15000));

    // 3. CHECK BALANCE
    const tokenBalance = await checkBalance(MINT_TO_TEST);
    if (tokenBalance === 0) {
        console.error("❌ Saldo 0. Forse il buy Jito non è stato confermato on-chain?");
        return;
    }
    console.log(`✅ Saldo rilevato: ${tokenBalance}. Procedo alla vendita.`);

    // 4. SELL con RPC STANDARD
    console.log("\n--- FASE 2: VENDITA (RPC STANDARD) ---");
    await executeStandardSell(MINT_TO_TEST, tokenBalance);
}

// --- FUNZIONE BUY (JITO) ---
async function executeJitoBuy(mint, amount) {
    try {
        console.log("Generazione Tx Buy...");
        const tx = await getPumpPortalTx(wallet.publicKey.toString(), "buy", mint, amount);
        if (!tx) return false;

        // Firma Tx Buy
        tx.sign([wallet]);

        // Prepara Tx Tip
        const tipAccount = new PublicKey(TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)]);
        const tipTx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: tipAccount,
                lamports: JITO_FEE * LAMPORTS_PER_SOL,
            })
        );
        const { blockhash } = await connection.getLatestBlockhash("finalized");
        tipTx.recentBlockhash = blockhash;
        tipTx.feePayer = wallet.publicKey;
        tipTx.sign(wallet);

        // Encoding
        const b58Tx = bs58.encode(tx.serialize());
        const b58Tip = bs58.encode(tipTx.serialize());

        // Invio Jito (Tokyo + UUID)
        const uuid = randomUUID();
        const endpoint = `${WS_JITO_URL}?uuid=${uuid}`;

        console.log(`📤 Invio Bundle a Tokyo...`);

        console.log("Tx Buy Base58:", b58Tx.substring(0, 20) + "...");
        console.log("Tx Tip Base58:", b58Tip.substring(0, 20) + "...");

        const response = await axios.post(endpoint, {
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[b58Tx, b58Tip]]
        });

        console.log("✅ Jito Risposta:", response.data);
        return true;

    } catch (e) {
        console.error("❌ Errore Jito Buy:", e.response ? e.response.data : e.message);
        return false;
    }
}

// --- FUNZIONE SELL (RPC STANDARD) ---
async function executeStandardSell(mint, amount) {
    try {
        console.log("Generazione Tx Sell...");
        // Nota: Per Sell Standard, PumpPortal potrebbe non includere Priority Fees alte.
        // L'ideale sarebbe aggiungere istruzioni ComputeBudget manualmente,
        // ma per ora affidiamoci al loro parametro 'priorityFee'.

        const payload = {
            publicKey: wallet.publicKey.toString(),
            action: "sell",
            mint: mint,
            denominatedInSol: "false",
            amount: amount,
            slippage: "50",
            priorityFee: 0.01, // Fee molto alta (0.01 SOL) per garantire l'uscita
            pool: "pump"
        };

        const response = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.status !== 200) throw new Error(await response.text());

        const data = await response.arrayBuffer();
        const tx = VersionedTransaction.deserialize(new Uint8Array(data));

        // Firma
        tx.sign([wallet]);

        console.log("📤 Invio Tx Standard alla Mempool...");
        const signature = await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: true,
            maxRetries: 5
        });

        console.log(`✅ Tx Inviata! Sig: ${signature}`);
        console.log(`🔎 Monitora qui: https://solscan.io/tx/${signature}`);

        // Attendiamo conferma per chiudere il test pulito
        const confirmation = await connection.confirmTransaction(signature, "confirmed");
        if (confirmation.value.err) throw new Error("Tx fallita on-chain");
        console.log("🎉 VENDITA COMPLETATA CON SUCCESSO!");

    } catch (e) {
        console.error("❌ Errore Sell Standard:", e.message);
    }
}

// --- HELPER ---
async function getPumpPortalTx(pubKey, action, mint, amount) {
    try {
        const response = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                publicKey: pubKey,
                action: action,
                mint: mint,
                denominatedInSol: action === 'buy' ? "true" : "false",
                amount: amount,
                slippage: "50",
                priorityFee: 0.005,
                pool: "pump"
            })
        });
        if (response.status !== 200) throw new Error(await response.text());
        const data = await response.arrayBuffer();
        return VersionedTransaction.deserialize(new Uint8Array(data));
    } catch (e) {
        console.error("API Error:", e.message);
        return null;
    }
}

async function checkBalance(mint) {
    try {
        const accounts = await connection.getParsedTokenAccountsByOwner(
            wallet.publicKey, { mint: new PublicKey(mint) }
        );
        return accounts.value.length ? accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount : 0;
    } catch (e) {
        return 0;
    }
}

main();
