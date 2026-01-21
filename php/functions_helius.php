<?php
function getDevHoldingInfo($mint) {
    global $HELIUS_RPC;
    $supply = getTokenSupply($HELIUS_RPC, $mint);
    if (!$supply) return false;

    $largest = getTokenLargestAccounts($HELIUS_RPC, $mint);
    if (!isset($largest['result']['value']) || empty($largest['result']['value'])) {
        return ['error' => 'no largest accounts', 'supply' => $supply['uiAmount'] ?? 0];
    }

    $top1_uiAmount = 0;
    foreach ($largest['result']['value'] as $acc) {
        if (($acc['uiAmount'] ?? 0) > $top1_uiAmount) {
            $top1_uiAmount = $acc['uiAmount'];
        }
    }

    $top1_pct = ($top1_uiAmount / $supply['uiAmount']) * 100;
    return [
        'top1_pct' => round($top1_pct, 2),
        'top1_amount' => $top1_uiAmount,
        'supply' => $supply['uiAmount'],
        'safe' => $top1_pct <= 10 ? 1 : 0
    ];
}

function getTokenSupply($rpcUrl, $mint) {
    $payload = json_encode(["jsonrpc"=>"2.0","id"=>1,"method"=>"getTokenSupply","params"=>[$mint,["commitment"=>"confirmed"]]]);
    return rpcCall($rpcUrl, $payload);
}

function getTokenLargestAccounts($rpcUrl, $mint) {
    $payload = json_encode(["jsonrpc"=>"2.0","id"=>1,"method"=>"getTokenLargestAccounts","params"=>[$mint,["commitment"=>"confirmed"]]]);
    return rpcCall($rpcUrl, $payload);
}

function rpcCall($rpcUrl, $payload) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $rpcUrl, CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 15
    ]);
    $response = json_decode(curl_exec($ch), true);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($httpCode !== 200) return ['error' => "HTTP $httpCode"];
    return $response['result'] ?? ['error' => 'no result'];
}
?>
