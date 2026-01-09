<?php
// update_outcomes.php - Cron ogni 5min
require_once 'db_config.php';  // Il tuo file con global $pdo

function updateOutcomes(PDO $pdo) {
    $stmt = $pdo->prepare("
        SELECT s.id, s.token_id, s.ts, s.mc_usd
        FROM snapshots s
        LEFT JOIN outcomes o ON o.snapshot_id = s.id
        WHERE (o.id IS NULL OR o.checked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))
        AND s.entered_11k_range = 1
        AND s.ts > DATE_SUB(NOW(), INTERVAL 2 HOUR)
        ORDER BY s.ts ASC
    ");
    $stmt->execute();
    $snapshots = $stmt->fetchAll(PDO::FETCH_ASSOC);  // Dichiarato qui

    $processed = 0;
    foreach ($snapshots as $snap) {
        $tokenId = $snap['token_id'];
        $snapTs = $snap['ts'];

        $end30m = date('Y-m-d H:i:s', strtotime($snapTs . ' +30 minutes'));
        $end60m = date('Y-m-d H:i:s', strtotime($snapTs . ' +60 minutes'));

        $max30m = getMaxMcUsd($pdo, $tokenId, $snapTs, $end30m);
        $max60m = getMaxMcUsd($pdo, $tokenId, $snapTs, $end60m);

        $hit35k30m = $max30m >= 35000 ? 1 : 0;
        $hit35k60m = $max60m >= 35000 ? 1 : 0;

        $insStmt = $pdo->prepare("
            INSERT INTO outcomes (snapshot_id, max_mc_usd_30m, max_mc_usd_60m, hit_35k_30m, hit_35k_60m, checked_at, final_status)
            VALUES (?, ?, ?, ?, ?, NOW(), 'checked')
            ON DUPLICATE KEY UPDATE
            max_mc_usd_30m=VALUES(max_mc_usd_30m),
            max_mc_usd_60m=VALUES(max_mc_usd_60m),
            hit_35k_30m=VALUES(hit_35k_30m),
            hit_35k_60m=VALUES(hit_35k_60m),
            checked_at=NOW()
        ");
        $insStmt->execute([$snap['id'], $max30m, $max60m, $hit35k30m, $hit35k60m]);
        $processed++;
    }
    return $processed;
}

function getMaxMcUsd(PDO $pdo, int $tokenId, string $startTs, string $endTs): float {
    $stmt = $pdo->prepare("
        SELECT COALESCE(MAX(mc_usd), 0) as max_mc
        FROM snapshots WHERE token_id=? AND ts BETWEEN ? AND ?
    ");
    $stmt->execute([$tokenId, $startTs, $endTs]);
    return (float) $stmt->fetchColumn();
}

// Esegui
$processed = updateOutcomes($pdo);
echo date('Y-m-d H:i:s') . " - Processati: $processed snapshot\n";
?>
