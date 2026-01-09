<?php
// scan_moralis_clean.php - Completo e funzionante
require_once 'db_config.php';  // $pdo globale

$url = 'https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/new?limit=100';
$data = callMoralis($url);

if (!$data || empty($data['result'])) exit;

foreach ($data['result'] as $token) {
    $mc_usd = (float)($token['fullyDilutedValuation'] ?? 0);

    if ($mc_usd >= 9000 && $mc_usd <= 17000) {
        $mint = $token['tokenAddress'];

        if (!alreadyProcessed($pdo, $mint)) {
            $token_id = saveToken($pdo, $mint, $token['name'] ?? 'UNK');

            // CHECK DEV HOLDING
            $devInfo = getDevHoldingInfo($mint);
            if ($devInfo && $devInfo['top1_pct'] <= 4.0) {  // Safe: top1 <=10%
                saveSnapshot($pdo, $token_id, $token, $devInfo);
                echo "SAVED SAFE: $mint top1={$devInfo['top1_pct']}%\n";
            } else {
                echo "SKIPPED DANGEROUS: $mint top1=" . ($devInfo['top1_pct'] ?? 'N/A') . "%\n";
            }
        }
    }
}

function getDevHoldingInfo($mint) {
    global $HELIUS_RPC;

    // 1. Total Supply
    $supply = getTokenSupply($HELIUS_RPC, $mint);
    if (!$supply) return false;

    // 2. Top 20 accounts
    $largest = getTokenLargestAccounts($HELIUS_RPC, $mint);
    if (!isset($largest['result']['value'])) return false;

    $top1_uiAmount = 0;
    foreach ($largest['result']['value'] as $acc) {
        if ($acc['uiAmount'] > $top1_uiAmount) {
            $top1_uiAmount = $acc['uiAmount'];
        }
    }

    $top1_pct = ($top1_uiAmount / $supply['uiAmount']) * 100;

    return [
        'top1_pct' => round($top1_pct, 2),
        'top1_amount' => $top1_uiAmount,
        'safe' => $top1_pct <= 10.0 ? 1 : 0
    ];
}

function getTokenSupply($rpcUrl, $mint) {
    $payload = json_encode([
        "jsonrpc" => "2.0", "id" => 1,
        "method" => "getTokenSupply",
        "params" => [$mint, ["commitment" => "confirmed"]]
    ]);
    return rpcCall($rpcUrl, $payload);
}

function getTokenLargestAccounts($rpcUrl, $mint) {
    $payload = json_encode([
        "jsonrpc" => "2.0", "id" => 1,
        "method" => "getTokenLargestAccounts",
        "params" => [$mint, ["commitment" => "confirmed"]]
    ]);
    return rpcCall($rpcUrl, $payload);
}

function rpcCall($rpcUrl, $payload) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $rpcUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 10
    ]);
    $response = json_decode(curl_exec($ch), true);
    curl_close($ch);
    return $response['result'] ?? false;
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

function saveSnapshot(PDO $pdo, int $token_id, array $data, array $devInfo): int {
    $stmt = $pdo->prepare("
        INSERT INTO snapshots (
            token_id, ts, mc_usd, liquidity_usd, price_native, price_usd,
            created_at_pump, logo_url, decimals, entered_11k_range, raw_data,
            dev_holding_top1_pct, dev_safe
        ) VALUES (
            ?, NOW(), ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?
        )
    ");

    $mc_usd   = isset($data['fullyDilutedValuation']) ? (float)$data['fullyDilutedValuation'] : 0.0;
    $liq_usd  = isset($data['liquidity']) ? (float)$data['liquidity'] : 0.0;
    $p_native = isset($data['priceNative']) ? (float)$data['priceNative'] : null;
    $p_usd    = isset($data['priceUsd']) ? (float)$data['priceUsd'] : null;
    $created  = isset($data['createdAt']) ? $data['createdAt'] : null; // es. 2026-01-08T16:34:56.000Z
    $logo     = $data['logo']    ?? null;
    $decimals = isset($data['decimals']) ? (int)$data['decimals'] : null;

    // Normalizza createdAt in DATETIME MySQL
    if ($created) {
        // 2026-01-08T16:34:56.000Z → 2026-01-08 16:34:56
        $created = str_replace('T', ' ', substr($created, 0, 19));
    }

    $stmt->execute([
        $token_id, $mc_usd, $liq_usd, $p_native, $p_usd, $created, $logo, $decimals,
        json_encode($data, JSON_UNESCAPED_SLASHES),
        $devInfo['top1_pct'],
        $devInfo['safe']
    ]);

    return (int)$pdo->lastInsertId();
}

?>

