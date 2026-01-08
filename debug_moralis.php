<?php
// debug_moralis.php
$API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6Ijg3NTE1ZTI2LTExNjEtNDRmMS1iZDJlLTNlNjQ1YmRkNDc4NiIsIm9yZ0lkIjoiNDg5MzAxIiwidXNlcklkIjoiNTAzNDMyIiwidHlwZUlkIjoiZWI0ZTgwOGEtYzAyYy00ZDNhLWI2YjctMGEyYWNjZTA0ZWIxIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3Njc4ODgzMDIsImV4cCI6NDkyMzY0ODMwMn0.8smuWpUwpZrvYO8QbKctJFZD4_IRqj6sDe5GxMyMEGs';

$url = 'https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/new?limit=100';

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'X-API-Key: ' . $API_KEY,
        'Accept: application/json'
    ]
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "HTTP: $httpCode\n";
echo "Response: $response\n";

$data = json_decode($response, true);
var_dump($data);
?>
<?php
