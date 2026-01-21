<?php
// scanner_loop.php - Loop che chiama scan_new_pairs.php ogni 15s
require_once 'db_config.php';  // se serve
require_once 'scan_new_pairs.php';  // Il TUO file esistente

echo "🚀 Scanner loop avviato (" . date('Y-m-d H:i:s') . ")\n";
echo "Chiama scanNewPairs() ogni 15s\n\n";

$scan_interval = 15;  // secondi
$max_scan = 3;
$scan_count = 0;

while($scan_count < $max_scan) {
    echo "\n=== SCAN #$scan_count (" . date('Y-m-d H:i:s') . ") ===\n";

    try {
        scanNewPairs();  // ← LA TUA FUNZIONE ESISTENTE
    } catch (Exception $e) {
        echo "❌ Errore: " . $e->getMessage() . "\n";
    }

    echo "--- Sleep $scan_interval s ---\n";
    $scan_count++;
    sleep($scan_interval);
}
?>
