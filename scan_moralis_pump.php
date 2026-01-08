<?php
// scan_moralis_clean.php - Completo e funzionante
require_once 'db_config.php';  // $pdo globale

$API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6Ijg3NTE1ZTI2LTExNjEtNDRmMS1iZDJlLTNlNjQ1YmRkNDc4NiIsIm9yZ0lkIjoiNDg5MzAxIiwidXNlcklkIjoiNTAzNDMyIiwidHlwZUlkIjoiZWI0ZTgwOGEtYzAyYy00ZDNhLWI2YjctMGEyYWNjZTA0ZWIxIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3Njc4ODgzMDIsImV4cCI6NDkyMzY0ODMwMn0.8smuWpUwpZrvYO8QbKctJFZD4_IRqj6sDe5GxMyMEGs';

$url = 'https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/new?limit=100';
$data = callMoralis($url);

if (!$data || empty($data['result'])) exit;

$saved = 0;
foreach ($data['result'] as $token) {
    $mc_usd = (float)($token['fullyDilutedValuation'] ?? 0);

    if ($mc_usd >= 9000 && $mc_usd <= 17000) {
        $mint = $token['tokenAddress'];

        if (!alreadyProcessed($pdo, $mint)) {
            $token_id = saveToken($pdo, $mint, $token['name'] ?? 'UNK');
            saveSnapshot($pdo, $token_id, $token);
            $saved++;
        }
    }
}

function callMoralis($url) {
    global $API_KEY;

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'X-API-Key: ' . $API_KEY,
            'Accept: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true);
}

function alreadyProcessed($pdo, $mint) {
    $stmt = $pdo->prepare("
        SELECT 1 FROM snapshots s
        JOIN tokens t ON s.token_id = t.id 
        WHERE t.address = ? AND s.ts > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ");
    $stmt->execute([$mint]);
    return $stmt->rowCount() > 0;
}

function saveToken($pdo, $address, $symbol) {
    $stmt = $pdo->prepare("
        INSERT IGNORE INTO tokens (address, symbol, first_seen) 
        VALUES (?, ?, NOW())
    ");
    $stmt->execute([$address, $symbol]);
    return $pdo->lastInsertId() ?: getTokenId($pdo, $address);
}

function getTokenId($pdo, $address) {
    $stmt = $pdo->prepare("SELECT id FROM tokens WHERE address = ?");
    $stmt->execute([$address]);
    return $stmt->fetchColumn();
}

function saveSnapshot($pdo, $token_id, $data) {
    $stmt = $pdo->prepare("
        INSERT INTO snapshots (
            token_id, ts, mc_usd, liquidity_usd, entered_11k_range, raw_data
        ) VALUES (
            ?, NOW(), ?, ?, 1, ?
        )
    ");
    $mc_usd = $data['fullyDilutedValuation'] ?? 0;
    $liq_usd = $data['liquidity'] ?? 0;

    $stmt->execute([$token_id, $mc_usd, $liq_usd, json_encode($data)]);
    return $pdo->lastInsertId();
}
?>

