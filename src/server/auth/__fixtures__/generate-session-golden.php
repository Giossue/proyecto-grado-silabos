<?php

$backend = $argv[1] ?? '';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Auth\SessionGuard;
use Illuminate\Cookie\CookieValuePrefix;
use Illuminate\Encryption\Encrypter;
use Illuminate\Session\ArraySessionHandler;
use Illuminate\Session\EncryptedStore;
use Symfony\Component\HttpFoundation\Cookie;

$rawKey = '0123456789abcdef0123456789abcdef';
$encrypter = new Encrypter($rawKey, 'AES-256-CBC');
$loginKey = 'login_web_'.sha1(SessionGuard::class);
$sessionId = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd';
$userId = '0193a3c2-1111-7000-8000-000000000001';

$cases = [
    'csrf cookie on a new session' => [
        ['put', '_token', 'TokenDePruebaTokenDePruebaTokenDePrueba1'],
        ['put', '_previous.url', 'http://localhost:3000/sanctum/csrf-cookie'],
        ['put', '_previous.route', 'sanctum.csrf-cookie'],
    ],
    'login after the csrf cookie' => [
        ['put', '_token', 'TokenDePruebaTokenDePruebaTokenDePrueba1'],
        ['put', '_previous.url', 'http://localhost:3000/sanctum/csrf-cookie'],
        ['put', '_previous.route', 'sanctum.csrf-cookie'],
        ['save'],
        ['put', $loginKey, $userId],
        ['put', '_token', 'OtroTokenOtroTokenOtroTokenOtroToken1234'],
        ['put', 'active_role_assignment_id', '0193a3c2-2222-7000-8000-000000000002'],
        ['put', 'password_hash_web', '89fb353c0d9dfea2cb86b4a08098e809a9f5dad343b9a4a11b723fbc4c9255d4'],
    ],
    'two-factor hand-off and challenge' => [
        ['put', '_token', 'TokenDePruebaTokenDePruebaTokenDePrueba1'],
        ['put', 'login.id', $userId],
        ['put', 'login.at', 1800000000],
        ['save'],
        ['forget', ['login.id', 'login.remember', 'login.at']],
        ['put', $loginKey, $userId],
    ],
    'stale role forgotten and the sole role put back' => [
        ['put', '_token', 'TokenDePruebaTokenDePruebaTokenDePrueba1'],
        ['put', 'active_role_assignment_id', 'stale'],
        ['put', $loginKey, $userId],
        ['save'],
        ['forget', ['active_role_assignment_id']],
        ['put', 'active_role_assignment_id', '0193a3c2-2222-7000-8000-000000000002'],
    ],
    'logout flushes and keeps only the new token' => [
        ['put', '_token', 'TokenDePruebaTokenDePruebaTokenDePrueba1'],
        ['put', $loginKey, $userId],
        ['save'],
        ['flush'],
        ['put', '_token', 'OtroTokenOtroTokenOtroTokenOtroToken1234'],
    ],
    'escaped values' => [
        ['put', '_token', 'TokenDePruebaTokenDePruebaTokenDePrueba1'],
        ['put', '_previous.url', 'https://silabos.ueb.edu.ec/a/b?x=ñandú «y» 😀'],
        ['put', 'nota', "línea\n\"comillas\" \\ </script>"],
    ],
];

$golden = ['loginKey' => $loginKey, 'sessionId' => $sessionId, 'cases' => []];
foreach ($cases as $name => $operations) {
    $handler = new ArraySessionHandler(240);
    $store = new EncryptedStore('silabos-ueb-session', $handler, $encrypter, $sessionId, 'json');
    $store->start();
    foreach ($operations as $operation) {
        match ($operation[0]) {
            'put' => $store->put($operation[1], $operation[2]),
            'forget' => $store->forget($operation[1]),
            'flush' => $store->flush(),
            'save' => (function () use ($store) { $store->save(); $store->start(); })(),
        };
    }
    $store->save();
    $stored = $handler->read($sessionId);
    $golden['cases'][] = [
        'name' => $name,
        'operations' => $operations,
        'json' => $encrypter->decrypt($stored),
        'payload' => base64_encode($stored),
    ];
}

$cookies = [];
foreach ([['XSRF-TOKEN', false], ['silabos-ueb-session', true]] as [$name, $httpOnly]) {
    $expires = time() + 14400;
    $value = $encrypter->encrypt(CookieValuePrefix::create($name, $rawKey).'valor-de-prueba', false);
    $cookie = new Cookie($name, $value, $expires, '/', null, false, $httpOnly, false, 'lax');
    $cookies[] = ['name' => $name, 'value' => $value, 'expires' => $expires, 'httpOnly' => $httpOnly, 'header' => (string) $cookie];
}
$golden['cookies'] = $cookies;
$golden['laravelSessionCookie'] = $encrypter->encrypt(CookieValuePrefix::create('silabos-ueb-session', $rawKey).$sessionId, false);

echo json_encode($golden, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE).PHP_EOL;
