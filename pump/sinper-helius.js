require('dotenv').config();
const WebSocket = require('ws');
const {
    Connection,
    Keypair,
    VersionedTransaction,
    PublicKey
} = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const fetch = require('node-fetch'); // Assicurati di averlo o usa fetch nativo (Node 18+)

// CONFIGURAZIONE
const CONNECTION = new Connection(process.env.RPC_URL, "confirmed");
const WALLET = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
const BUY_AMOUNT = 0.05; // SOL
const SELL_DELAY_MS = 2000; // 2 secondi di inattività (simulato per ora con delay fisso o monitoraggio)

// Per MVP: Vendi dopo X secondi o se profitto (logica semplificata qui, espandibile)
const AUTO_SELL_AFTER_MS = 10000; // Vendi dopo 10s per test sicurezza

console.log(`🔫 Sniper Helius Attivo`);
console.log(`Wallet: ${WALLET.publicKey.toString()}`);

// 1. MONITORAGGIO: WebSocket PumpPortal
const ws = new WebSocket('wss://pumpportal.fun/api/data');

ws.on('open', function open() {
    console.log('✅ Connesso a PumpPortal. In attesa di token...');
    // Ascoltiamo i nuovi token
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
});

ws.on('message', async function incoming(data) {
    try {
        const message = JSON.parse(data);

        // Filtra eventi non pertinenti
        if (!message.mint) return;

        // FILTRO BASE (Anti-Spam)
        // Qui potresti rimettere il controllo "initialBuy" se il payload lo ha

        console.log(`\n🚀 NEW TOKEN: ${message.name} (${message.symbol})`);
        console.log(`   Mint: ${message.mint}`);

        // --- ESECUZIONE BUY IMMEDIATA ---
        await executeTrade(message.mint, "buy");

    } catch (e) {
        console.error("Errore WebSocket:", e);
    }
});

// FUNZIONE UNICA DI TRADING (Buy/Sell) via RPC
async function executeTrade(mint, action) {
    try {
        console.log(`⚡ Esecuzione ${action.toUpperCase()} su ${mint}...`);

        // 1. Chiedi tx a PumpPortal
        const response = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                publicKey: WALLET.publicKey.toString(),
                action: action,
                mint: mint,
                denominatedInSol: action === 'buy' ? "true" : "false",
                amount: action === 'buy' ? BUY_AMOUNT : "100%", // Sell 100%
                slippage: "50",
                priorityFee: 0.01, // 0.01 SOL Priority Fee (Alta per garantire inclusione senza Jito)
                pool: "pump"
            })
        });

        if (response.status !== 200) {
            console.error(`❌ Errore API PumpPortal (${action}):`, await response.text());
            return;
        }

        const data = await response.arrayBuffer();
        const tx = VersionedTransaction.deserialize(new Uint8Array(data));

        // 2. Firma
        tx.sign([WALLET]);

        // 3. Invia via Helius RPC (Standard Send)
        // skipPreflight: true è fondamentale per velocità (salta simulazione)
        const signature = await CONNECTION.sendRawTransaction(tx.serialize(), {
            skipPreflight: true,
            maxRetries: 5,
        });

        console.log(`✅ ${action.toUpperCase()} Inviata! Sig: ${signature}`);
        console.log(`   Monitor: https://solscan.io/tx/${signature}`);

        // LOGICA POST-BUY (Solo se abbiamo comprato)
        if (action === 'buy') {
            console.log(`⏳ Attesa tattica ${AUTO_SELL_AFTER_MS}ms prima di vendere...`);

            // Qui in futuro metterai il monitoraggio attivo del prezzo.
            // Per ora: Timer fisso per testare il ciclo.
            setTimeout(async () => {
                // Recupera balance per essere sicuri di cosa vendere
                const balance = await checkBalance(mint);
                if (balance > 0) {
                    await executeTrade(mint, "sell");
                } else {
                    console.log("⚠️ Saldo 0 al momento della vendita. Buy fallito o lento?");
                }
            }, AUTO_SELL_AFTER_MS);
        }

    } catch (e) {
        console.error(`❌ CRITICAL ERROR (${action}):`, e.message);
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
