<?php
// scan_new_pairs_fixed.php - Usa SEARCH per trovare nuovi pairs SOL
require_once 'db_config.php';

function trackTokenInterval($pdo, $token_id, $address) {
    // Salva snapshot ogni 5 minuti per 60m
    // Usa DexScreener + Helius per holders
    $current = getTokenFullData($address);  // MC, volume, holders
    saveSnapshot($pdo, $token_id, $current);
}

function scanNewPairs() {
    global $pdo;

    // 🔍 Cerca pairs con SOL (cattura nuovi token)
    $search_url = 'https://api.dexscreener.com/latest/dex/search/?q=SOL';
    $data = callDexScreener($search_url);

    if (!$data || !isset($data['pairs']) || empty($data['pairs'])) {
        echo "❌ Nessun pair SOL trovato\n";
        return;
    }

    $pairs = $data['pairs'];
    echo "📊 " . count($pairs) . " pairs SOL trovati\n";

    $snapshots_saved = 0;
    foreach ($pairs as $pair) {
        // TRIGGER: MC USD 9k-13k
        $mc_usd = $pair['marketCap'] ?? null;
        if (!$mc_usd || $mc_usd < 9000 || $mc_usd > 13000) {
            continue;
        }

        $token_address = $pair['baseToken']['address'];
        $symbol = $pair['baseToken']['symbol'] ?? 'UNKNOWN';
        $pair_address = $pair['pairAddress'];
        $dex_name = $pair['dexId'] ?? 'unknown';
        $liquidity_usd = $pair['liquidity']['usd'] ?? 0;
        $volume_h1 = $pair['volume']['h1'] ?? 0;
        $price_change_h1 = $pair['priceChange']['h1'] ?? 0;

        echo "🎯 Candidato: $symbol MC= $" . number_format($mc_usd) . "\n";

        // Salva
        $token_id = saveToken($pdo, $token_address, $symbol);
        $snapshot_id = saveSnapshot($pdo, $token_id, [
            'mc_usd' => $mc_usd,
            'liquidity_usd' => $liquidity_usd,
            'volume_h1' => $volume_h1,
            'price_change_h1' => $price_change_h1,
            'dex_name' => $dex_name,
            'pair_address' => $pair_address,
            'raw_data' => json_encode($pair)
        ]);

        trackTokenInterval($pdo, $token_id, $token_address);

        echo "💾 Salvato snapshot #$snapshot_id\n\n";
        $snapshots_saved++;
    }

    echo "✅ Totale snapshot: $snapshots_saved\n";
}

// [Funzioni saveToken, saveSnapshot, callDexScreener uguali al precedente]

function callDexScreener($url) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_USERAGENT => 'MemecoinSniper/1.0'
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    echo "API response HTTP: $httpCode\n";

    if ($httpCode !== 200) {
        echo "❌ Errore $httpCode\n";
        return false;
    }

    $data = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo "❌ JSON errore\n";
        return false;
    }

    return $data;
}
?>
