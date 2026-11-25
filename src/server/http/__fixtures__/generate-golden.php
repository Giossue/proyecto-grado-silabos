<?php

$backend = $argv[1] ?? '';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['app.debug' => false]);

use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\SessionGuard;
use Illuminate\Cookie\CookieValuePrefix;
use Illuminate\Encryption\Encrypter;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

$rawKey = '0123456789abcdef0123456789abcdef';
$appKey = 'base64:'.base64_encode($rawKey);
$encrypter = new Encrypter($rawKey, 'AES-256-CBC');
$cookieName = 'silabos-ueb-session';
$sessionId = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd';
$csrfToken = 'TokenDePruebaTokenDePruebaTokenDePrueba1';
$userId = '0193a3c2-1111-7000-8000-000000000001';
$roleId = '0193a3c2-2222-7000-8000-000000000002';
$passwordHash = '$2y$12$abcdefghijklmnopqrstuuJr0bZ1y6m2Qm8Yd3VnQh8l5wq3V2Gk.';
$loginKey = 'login_web_'.sha1(SessionGuard::class);
$passwordHashForCookie = hash_hmac('sha256', $passwordHash, $appKey);

$attributes = [
    '_token' => $csrfToken,
    '_previous' => ['url' => 'http://localhost:3000/api/v1/session', 'route' => 'api.v1.session.show'],
    '_flash' => ['old' => [], 'new' => []],
    $loginKey => $userId,
    'password_hash_web' => $passwordHashForCookie,
    'active_role_assignment_id' => $roleId,
    'nota' => 'Sesión con «acentos» y 😀',
];

$render = function (Throwable $e, array $server = ['HTTP_ACCEPT' => 'application/json']) use ($app): array {
    $request = Request::create('/api/v1/notifications', 'GET', [], [], [], $server);
    $response = $app->make(Illuminate\Contracts\Debug\ExceptionHandler::class)->render($request, $e);

    return ['status' => $response->getStatusCode(), 'body' => $response->getContent()];
};
$validation = function (array $data): ValidationException {
    return new ValidationException(Validator::make($data, ['status' => ['nullable', 'string', 'in:all,unread']]));
};

$paginators = [];
foreach ([[0, 1, []], [5, 1, []], [45, 2, ['status' => 'unread']], [45, 3, ['page' => '3', 'status' => 'all']], [45, 9, []], [400, 1, []], [400, 9, ['x' => "a b/c~d!'()*é"]], [400, 12, []], [400, 20, []], [261, 14, []], [261, 7, []]] as [$total, $page, $query]) {
    $count = max(0, min(20, $total - ($page - 1) * 20));
    $items = $count > 0 ? array_map(fn (int $i): array => ['n' => $i], range(1, $count)) : [];
    $paginator = (new LengthAwarePaginator($items, $total, 20, $page, ['path' => 'http://localhost:3000/api/v1/notifications', 'pageName' => 'page']))->appends($query);
    $paginators[] = ['total' => $total, 'page' => $page, 'query' => (object) $query, 'json' => json_encode($paginator->toArray())];
}

$pageInputs = [];
foreach (['1', '2', '0', '-1', '+3', '03', 'abc', '2.5', '9223372036854775807', '9223372036854775808', ''] as $input) {
    $resolved = filter_var($input, FILTER_VALIDATE_INT) !== false && (int) $input >= 1 ? (int) $input : 1;
    $pageInputs[] = ['input' => $input, 'page' => $resolved];
}

echo json_encode([
    'appKey' => $appKey,
    'cookieName' => $cookieName,
    'sessionId' => $sessionId,
    'csrfToken' => $csrfToken,
    'userId' => $userId,
    'roleId' => $roleId,
    'passwordHash' => $passwordHash,
    'loginKey' => $loginKey,
    'passwordHashForCookie' => $passwordHashForCookie,
    'attributes' => $attributes,
    'sessionPayload' => base64_encode($encrypter->encrypt(json_encode($attributes))),
    'sessionCookie' => $encrypter->encrypt(CookieValuePrefix::create($cookieName, $rawKey).$sessionId, false),
    'xsrfHeader' => $encrypter->encrypt(CookieValuePrefix::create('XSRF-TOKEN', $rawKey).$csrfToken, false),
    'sessionPayloadWithOtherKey' => base64_encode((new Encrypter(str_repeat('z', 32), 'AES-256-CBC'))->encrypt(json_encode($attributes))),
    'errors' => [
        'unauthenticated' => $render(new AuthenticationException('Unauthenticated.')),
        'inactive' => $render(new HttpException(403, 'La cuenta está desactivada.')),
        'unverified' => $render(new HttpException(403, 'Your email address is not verified.')),
        'noActiveRole' => $render(new HttpException(409, 'Seleccione un rol vigente.')),
        'csrf' => $render(new TokenMismatchException('CSRF token mismatch.')),
        'invalidStatus' => $render($validation(['status' => 'x'])),
        'arrayStatus' => $render($validation(['status' => ['x']])),
    ],
    'jsonSamples' => [
        ['value' => ['a/b', 'ñandú «x»', '😀', "l1\nl2\t\x01", 'a"b\\c', 1.5, true, null, [], ['k' => 'v']], 'json' => json_encode(['a/b', 'ñandú «x»', '😀', "l1\nl2\t\x01", 'a"b\\c', 1.5, true, null, [], ['k' => 'v']])],
    ],
    'paginators' => $paginators,
    'pageInputs' => $pageInputs,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
