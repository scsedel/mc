<?php
require_once 'db_config.php';  // $API_KEY, $HELIUS_RPC, $pdo

echo "=== DEBUG MORALIS + HELIUS ===\n";
echo date('Y-m-d H:i:s') . "\n\n";

// 1. Test Moralis PUMP.FUN
echo "1. MORALIS /pumpfun/new...\n";
$url = 'https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/new?limit=100';
$data = callMoralis($url);
if (!$data || empty($data['result'])) {
    echo "❌ MORALIS ERRORE: " . json_encode($data, JSON_PRETTY_PRINT) . "\n";
    exit;
}
echo "✅ MORALIS OK: " . count($data['result']) . " totali\n";

$matching = [];
foreach ($data['result'] as $t) {
    $mc = $t['fullyDilutedValuation'] ?? 0;
    if ($mc >= 9000 && $mc <= 17000) {
        $matching[] = $t;
    }
}
echo "   → " . count($matching) . " in 9-17k USD\n";

if (!empty($matching)) {
    $sampleMint = $matching[0]['tokenAddress'];
    $sampleMc = $matching[0]['fullyDilutedValuation'] ?? 'N/A';
    echo "SAMPLE MINT: $sampleMint (MC: $sampleMc)\n";
} else {
    echo "Nessun token 9-17k!\n";
    exit;
}

// 2. Test Helius
echo "\n2. HELIUS DEBUG su $sampleMint...\n";
include 'functions_helius.php';  // Copia funzioni sotto
$devInfo = getDevHoldingInfo($sampleMint);
echo "RISULTATO: " . json_encode($devInfo, JSON_PRETTY_PRINT) . "\n";

// 3. DB check
echo "\n4. DB CHECK $sampleMint:\n";
$stmt = $pdo->prepare("SELECT COUNT(*) FROM tokens t JOIN snapshots s ON t.id=s.token_id WHERE t.address=?");
$stmt->execute([$sampleMint]);
$exists = $stmt->fetchColumn();
echo "- alreadyProcessed(24h): " . ($exists ? 'YES (SKIP)' : 'NO') . "\n";

// 5. Stats
echo "\n5. STATS OGGI:\n";
$stmt = $pdo->query("SELECT COUNT(*) as tokens, COALESCE(SUM(s.entered_11k_range),0) as snaps FROM tokens t LEFT JOIN snapshots s ON t.id=s.token_id WHERE t.first_seen >= CURDATE()");
$stats = $stmt->fetch(PDO::FETCH_ASSOC);
echo "Tokens: {$stats['tokens']}, Snapshots 11k: {$stats['snaps']}\n";

echo "\n=== FINE === Esegui: php scan_moralis_clean.php per test live\n";

function callMoralis($url) {
    global $API_KEY;
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ['X-API-Key: ' . $API_KEY, 'Accept: application/json']
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $decoded = json_decode($response, true);
    if ($httpCode !== 200) echo "Moralis HTTP $httpCode: $response\n";
    return $decoded;
}
?>
