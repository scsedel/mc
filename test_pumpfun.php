<?php
// test_dexscreener_fixed.php - COMPATIBILE PHP 8+
$token_address = '38S5HdbHToye6XjdJzbKyt4AtD9Ep1b52r2C2rXapump';

function testDexScreener($address) {
    $url = "https://api.dexscreener.com/latest/dex/tokens/{$address}";

    echo "=== DexScreener: {$url} ===\n";

    $data = callAPI($url);
    if (!$data) {
        return;
    }

    // Fix PHP 8+: salva prima la variabile
    $pairs = $data['pairs'] ?? null;
    if (!$pairs || !is_array($pairs) || empty($pairs)) {
        echo "❌ Nessun pair trovato\n";
        return;
    }

    $main_pair = $pairs[0];
    echo "✓ TOKEN TROVATO!\n";
    echo "Symbol: " . ($main_pair['baseToken']['symbol'] ?? 'N/A') . "\n";
    echo "Price USD: " . number_format($main_pair['priceUsd'] ?? 0, 6) . "\n";

    // Market Cap
    if (!empty($main_pair['marketCap'])) {
        $mc_usd = (float)$main_pair['marketCap'];
        $mc_sol = $mc_usd / 150; // ~150 USD/SOL
        echo "Market Cap: $" . number_format($mc_usd) . " (~" . number_format($mc_sol, 0) . " SOL)\n";

        if ($mc_sol > 9000 && $mc_sol < 13000) {
            echo "🚨 MC IN RANGE 9k-13k SOL! → SNAPSHOT!\n";
        }
    } else {
        echo "Market Cap: N/A (troppo nuovo)\n";
    }

    echo "Volume 24h: $" . number_format($main_pair['volume']['h24'] ?? 0, 0) . "\n";
    echo "Liquidity USD: $" . number_format($main_pair['liquidity']['usd'] ?? 0, 0) . "\n";
    echo "Price Change 1h: " . number_format($main_pair['priceChange']['h1'] ?? 0, 2) . "%\n";

    echo "\n";
}

function callAPI($url) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => 'MemecoinSniper-DexScreener/1.0'
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        echo "❌ cURL: $error\n";
        return false;
    }

    if ($httpCode !== 200) {
        echo "❌ HTTP $httpCode\n";
        return false;
    }

    $decoded = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo "❌ JSON parse error\n";
        return false;
    }

    return $decoded;
}

// Test
echo "PHP version: " . PHP_VERSION . "\n\n";
testDexScreener($token_address);

// Test pairs SOL (per trovare token nuovi)
$sol_pairs_url = 'https://api.dexscreener.com/latest/dex/pairs/solana';
echo "=== SOL Pairs ===\n";
$sol_data = callAPI($sol_pairs_url);
if ($sol_data) {
    $pairs = $sol_data['pairs'] ?? [];
    echo count($pairs) . " pairs SOL trovati\n";

    // Mostra primi 5 con MC ~10k
    foreach (array_slice($pairs, 0, 5) as $pair) {
        $mc = $pair['marketCap'] ?? 0;
        if ($mc > 5000 && $mc < 20000) {
            printf("  %s (%.0f SOL)\n", $pair['baseToken']['symbol'], $mc / 150);
        }
    }
}
?>