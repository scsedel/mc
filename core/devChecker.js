// core/devChecker.js

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

// Costruisce l'URL RPC se non è già completo
function getHeliusUrl() {
    if (HELIUS_RPC_URL) return HELIUS_RPC_URL;
    if (!HELIUS_API_KEY) {
        throw new Error('HELIUS_API_KEY o HELIUS_RPC_URL non impostati nelle variabili di ambiente');
    }
    return `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
}

// Ritorna il totale dei token che il dev possiede per quel mint (in unità "umane", non lamport)
async function getDevBalance(mintAddress, devAddress) {
    if (!mintAddress) throw new Error('mintAddress è obbligatorio');
    if (!devAddress) throw new Error('devAddress è obbligatorio');

    const url = getHeliusUrl();

    const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
            devAddress,
            { mint: mintAddress },
            { encoding: 'jsonParsed' }
        ]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Helius HTTP ${response.status}: ${text}`);
    }

    const json = await response.json();

    if (json.error) {
        throw new Error(`Helius error: ${JSON.stringify(json.error)}`);
    }

    const accounts = json.result?.value ?? [];

    // Somma tutti i saldi token del dev per quel mint
    let total = 0;
    for (const acc of accounts) {
        const amount = acc.account?.data?.parsed?.info?.tokenAmount;
        const uiAmount = amount?.uiAmount;
        if (typeof uiAmount === 'number') {
            total += uiAmount;
        }
    }

    return total;
}

module.exports = {
    getDevBalance,
};
