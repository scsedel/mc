const WebSocket = require('ws');

// Usa il WebSocket di PumpPortal
const ws = new WebSocket('wss://pumpportal.fun/api/data');

ws.on('open', function open() {
    console.log('✅ Connesso al feed di Pump.fun via PumpPortal');

    // Ci iscriviamo agli eventi "New Token"
    let payload = {
        method: "subscribeNewToken",
    };
    ws.send(JSON.stringify(payload));
});

ws.on('message', function incoming(data) {
    try {
        const message = JSON.parse(data);

        // Se il messaggio contiene 'mint', è un nuovo token
        if (message.mint) {
            const now = new Date().toISOString().split('T')[1].split('.')[0]; // Orario attuale
            console.log(`[${now}] 🚀 NEW: ${message.name} (${message.symbol}) | ${message.mint}`);

            // Qui metteremo la logica: "Compra SUBITO!"
        }
    } catch (e) {
        console.error("Errore:", e);
    }
});

ws.on('close', function close() {
    console.log('❌ Connessione chiusa');
});
