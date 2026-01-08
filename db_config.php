<?php
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
