<?php

// check_outcomes.php - Verifica se hanno raggiunto 25k
require_once 'db_config.php';

function checkOutcomes()
{
    global $pdo;

    // Snapshot da controllare (11k da almeno 30m, senza outcome)
    $stmt = $pdo->prepare("
        SELECT s.id, s.token_id, s.ts, t.address
        FROM snapshots s
        JOIN tokens t ON s.token_id = t.id
        WHERE s.entered_11k_range = 1 
        AND s.id NOT IN (SELECT snapshot_id FROM outcomes)
        AND TIMESTAMPDIFF(MINUTE, s.ts, NOW()) >= 30
        LIMIT 50  -- batch piccolo
    ");
    $stmt->execute();
    $snapshots = $stmt->fetchAll();

    foreach ($snapshots as $snap) {
        $data = checkTokenStatus($snap['address']);

        $max_mc_30m = $data['max_mc_usd'] ?? null;
        $hit_25k_30m = $max_mc_30m >= 25000;

        // Salva outcome
        $stmt_out = $pdo->prepare("
            INSERT INTO outcomes (snapshot_id, max_mc_30m, hit_25k_30m, checked_at)
            VALUES (?, ?, ?, NOW())
        ");
        $stmt_out->execute([$snap['id'], $max_mc_30m, $hit_25k_30m]);

        echo "📊 Snapshot {$snap['id']}: max MC {$max_mc_30m}k USD → " . ($hit_25k_30m ? 'SUCCESS' : 'FAIL') . "\n";
    }
}

function checkTokenStatus($token_address)
{
    // Ritorna MC attuale da DexScreener
    $url = "https://api.dexscreener.com/latest/dex/tokens/{$token_address}";
    $data = callDexScreener($url);

    $pairs = $data['pairs'] ?? [];
    if (!empty($pairs)) {
        return ['max_mc_usd' => $pairs[0]['marketCap'] ?? 0];
    }
    return ['max_mc_usd' => 0];
}

// Esegui
checkOutcomes();

