<?php
$API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6Ijg3NTE1ZTI2LTExNjEtNDRmMS1iZDJlLTNlNjQ1YmRkNDc4NiIsIm9yZ0lkIjoiNDg5MzAxIiwidXNlcklkIjoiNTAzNDMyIiwidHlwZUlkIjoiZWI0ZTgwOGEtYzAyYy00ZDNhLWI2YjctMGEyYWNjZTA0ZWIxIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3Njc4ODgzMDIsImV4cCI6NDkyMzY0ODMwMn0.8smuWpUwpZrvYO8QbKctJFZD4_IRqj6sDe5GxMyMEGs';

$HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=b25800c5-948f-42bd-acbf-f81c4bbf240d';

// db_config.php
$host = 'localhost';
$dbname = 'mc_fjhd783';
$username = 'mc_fjhdu783';
$password = 'KeXh5E_0%fvkzo4e';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    die("DB Error: " . $e->getMessage());
}
?>
