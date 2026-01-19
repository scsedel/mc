require('dotenv').config();
const { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const axios = require('axios');

// --- CONFIGURAZIONE TEST ---
const MINT_TO_TEST = "3TMb8ZmqRXTcKNPNz4igAPC8PCK9wwcjfhikgTchpump";
const BUY_AMOUNT_SOL = 0.03; // Cifra minima per test (circa 0.20$)
const JITO_FEE = 0.0001;      // Mancia minima

const connection = new Connection(process.env.RPC_URL);
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
const uuid = require('crypto').randomUUID();
// const JITO_URL = `https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles?uuid=${uuid}`;

// Tip Accounts Jito (Rotazione casuale)
const TIP_ACCOUNTS = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PuwkqqD08CWufQ",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopXSjbCp5R9HqvATyDt1USorEVs"
];

async function main() {
    console.log("🧪 INIZIO TEST SINGOLO TRADE");
    console.log("Wallet:", wallet.publicKey.toString());
    console.log("Token Target:", MINT_TO_TEST);

    // 1. BUY
    console.log("\n--- 1. ESECUZIONE BUY ---");
    await executeBundle("buy", MINT_TO_TEST, BUY_AMOUNT_SOL);

    // 2. WAIT
    console.log("\n⏳ Attendo 15 secondi per conferma on-chain...");
    await new Promise(r => setTimeout(r, 15000));

    // 3. CHECK BALANCE (Per essere sicuri di avere qualcosa da vendere)
    // Nota: in un bot veloce salteresti questo check, ma per test è utile
    const balance = await checkTokenBalance(MINT_TO_TEST);
    if (balance <= 0) {
        console.error("❌ Nessun token trovato nel wallet. Buy fallito?");
        return;
    }
    console.log(`✅ Token trovati: ${balance}. Procedo alla vendita.`);

    // 4. SELL
    console.log("\n--- 2. ESECUZIONE SELL ---");
    // Vendiamo il 100%
    await executeBundle("sell", MINT_TO_TEST, balance); // balance qui deve essere l'amount corretto

    console.log("\n🏁 TEST COMPLETATO.");
}

async function executeBundle(action, mint, amount) {
    console.log(`\n🤖 Inizio procedura ${action.toUpperCase()}...`);

    // 1. Ottieni la transazione da PumpPortal
    let txData;
    try {
        const payload = {
            publicKey: wallet.publicKey.toString(),
            action: action,
            mint: mint,
            denominatedInSol: action === 'buy' ? "true" : "false",
            amount: amount,
            slippage: "50", // Slippage alto per sicurezza
            priorityFee: 0.005, // Fee generosa
            pool: "pump"
        };

        const response = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if(response.status !== 200) {
            console.error("❌ Errore API PumpPortal:", await response.text());
            return false;
        }
        txData = await response.arrayBuffer();
    } catch (err) {
        console.error("❌ Errore Network PumpPortal:", err.message);
        return false;
    }

    // 2. Deserializza
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    tx.sign([wallet]);

    // 3. TENTATIVO JITO (Tokyo)
    try {
        // Prepariamo la Tip
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

        const b58Tx = bs58.encode(tx.serialize());
        const b58Tip = bs58.encode(tipTx.serialize());

        // UUID nuovo per ogni richiesta
        const uuid = require('crypto').randomUUID();
        // Usiamo TOKYO fissi visto che funziona
        const currentJitoUrl = `https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles?uuid=${uuid}`;

        console.log(`📤 Invio Bundle a Jito (Tokyo)...`);
        const bundleResp = await axios.post(currentJitoUrl, {
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [[b58Tx, b58Tip]]
        });

        console.log(`✅ Jito ${action} OK:`, bundleResp.data);
        return true;

    } catch (e) {
        console.error(`⚠️ Jito Fallito (${e.response ? e.response.status : e.message}).`);

        // 4. FAILOVER: SE È UNA VENDITA, USA RPC STANDARD
        if (action === 'sell') {
            console.log("🚨 Attivazione FAILOVER: Invio transazione standard via RPC...");
            try {
                // Inviamo la transazione raw direttamente alla rete Solana
                // Nota: tx è già firmata
                const signature = await connection.sendRawTransaction(tx.serialize(), {
                    skipPreflight: true,
                    maxRetries: 5
                });
                console.log(`✅ Transazione Standard Inviata! Sig: ${signature}`);

                // Opzionale: attendi conferma
                const confirmation = await connection.confirmTransaction(signature, "confirmed");
                if (confirmation.value.err) throw new Error("Tx fallita on-chain");

                console.log("🎉 Vendita Confermata On-Chain!");
                return true;
            } catch (rpcErr) {
                console.error("❌ Anche il Failover è fallito:", rpcErr.message);
                return false;
            }
        } else {
            // Se il BUY fallisce su Jito, NON usare failover standard (rischioso per sandwich attack)
            console.log("❌ Buy Jito fallito. Abortisco per sicurezza.");
            return false;
        }
    }
}


async function checkTokenBalance(mint) {
    // Helper veloce per vedere quanti token abbiamo
    const accounts = await connection.getParsedTokenAccountsByOwner(
        wallet.publicKey,
        { mint: new PublicKey(mint) }
    );
    if (accounts.value.length === 0) return 0;
    return accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
}

main();
