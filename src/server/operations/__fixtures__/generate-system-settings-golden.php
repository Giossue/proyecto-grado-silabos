<?php

$backend = $argv[1] ?? '';
$output = $argv[2] ?? __DIR__.'/system-settings-golden.json';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use App\Modules\Operations\Presentation\Http\Requests\UpdateSystemSettingsRequest;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

$urls = [
    'https://api.deepseek.com', 'https://api.deepseek.com/', 'https://api.deepseek.com/v1', 'http://api.deepseek.com', 'HTTPS://API.EXAMPLE.COM',
    'https://localhost', 'https://localhost:8443/v1', 'https://127.0.0.1:9000', 'https://[::1]:443/x', 'https://user:clave@host.ec/p',
    'https://ñandú.ec/ruta', 'https://xn--and-6ma2c.ec', 'https://a..b', 'https://-a.ec', 'https://a_b.ec', 'https://ejemplo.ec/a b',
    'https://ejemplo.ec/a%20b?x=1&y[]=2#frag', 'https://ejemplo.ec?q=1', 'https://ejemplo.ec#top', 'ftp://ejemplo.ec', 'https:/ejemplo.ec',
    'https://', 'ejemplo.ec', 'https://ejemplo.ec:', 'https://ejemplo.ec:80a', 'https://ejemplo.ec/ruta\n', "https://ejemplo.ec\n", 'https://ejemplo.ec/ruta|x',
    'https://ejemplo.ec/~usuario', "https://ejemplo.ec/it's", 'https://١.١.١.١', 'https://☃.net', 'https://ejemplo.ec./', 'https://ejemplo',
    'https://300.1.1.1', 'https://ejemplo.ec/%zz', 'https://[2001:db8::1]', 'https://[2001:db8::g]', 'https://biblioteca.ueb.edu.ec/cgi-bin/koha',
];
$urlCases = [];
foreach ($urls as $url) {
    $urlCases[] = ['url' => $url, 'https' => Str::isUrl($url, ['https']), 'http,https' => Str::isUrl($url, ['http', 'https'])];
}

$user = (new User)->forceFill(['usuario_id' => '0198a2b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b', 'correo_electronico' => 'admin@example.test', 'contrasena' => Hash::make('Secreta-2026')]);
Auth::guard('web')->setUser($user);

$cases = [
    ['notificaciones', []],
    ['notificaciones', ['emails' => true, 'digest_time' => '07:30']],
    ['notificaciones', ['emails' => '1', 'digest_time' => '7:30']],
    ['notificaciones', ['emails' => 'si', 'digest_time' => '24:00']],
    ['notificaciones', ['emails' => 0, 'digest_time' => 730]],
    ['notificaciones', ['emails' => [], 'digest_time' => ['07:30']]],
    ['ia', []],
    ['ia', ['current_password' => 'mala', 'driver' => 'disabled', 'connect_timeout' => 2, 'timeout' => 20]],
    ['ia', ['current_password' => 'Secreta-2026', 'driver' => 'disabled', 'connect_timeout' => 2, 'timeout' => 20]],
    ['ia', ['current_password' => 'Secreta-2026', 'driver' => 'deepseek', 'connect_timeout' => 2, 'timeout' => 20]],
    ['ia', ['current_password' => 'Secreta-2026', 'driver' => 'deepseek', 'base_url' => 'http://api.deepseek.com', 'model' => 'deepseek chat', 'api_key' => 'sk 1', 'connect_timeout' => 0, 'timeout' => 301]],
    ['ia', ['current_password' => 'Secreta-2026', 'driver' => 'otro', 'base_url' => 'https://api.deepseek.com/', 'model' => 'deepseek-chat', 'api_key' => 'sk-1', 'clear_api_key' => 'x', 'connect_timeout' => '3', 'timeout' => '5.5']],
    ['ia', ['current_password' => 'Secreta-2026', 'driver' => 'deepseek', 'base_url' => str_repeat('a', 250).'https://x.ec', 'model' => str_repeat('m', 65), 'api_key' => str_repeat('k', 501), 'connect_timeout' => 'tres', 'timeout' => true]],
    ['ia', ['current_password' => 123, 'driver' => ['deepseek'], 'base_url' => 5, 'model' => 5, 'api_key' => 5, 'connect_timeout' => 31, 'timeout' => 4]],
    ['ia', ['current_password' => 'Secreta-2026', 'driver' => 'deepseek', 'base_url' => 'https://api.deepseek.com', 'model' => 'deepseek-chat', 'api_key' => "sk\u{a0}1", 'clear_api_key' => true, 'connect_timeout' => 30, 'timeout' => 300]],
    ['biblioteca', []],
    ['biblioteca', ['current_password' => 'Secreta-2026', 'driver' => 'koha']],
    ['biblioteca', ['current_password' => 'Secreta-2026', 'driver' => 'koha', 'base_url' => 'ftp://biblioteca.ec']],
    ['biblioteca', ['current_password' => 'Secreta-2026', 'driver' => 'koha', 'base_url' => 'http://biblioteca.ueb.edu.ec/']],
    ['biblioteca', ['current_password' => 'Secreta-2026', 'driver' => 'disabled', 'base_url' => 'no es url']],
    ['biblioteca', ['current_password' => 'Secreta-2026', 'driver' => true]],
    ['biblioteca', ['current_password' => 'Secreta-2026', 'driver' => 'KOHA', 'base_url' => null]],
];

$validation = [];
foreach ($cases as [$section, $input]) {
    $request = UpdateSystemSettingsRequest::create('/api/v1/admin/system-settings/'.$section, 'PUT', $input);
    $route = (new Route('PUT', 'api/v1/admin/system-settings/{section}', []))->bind($request);
    $route->setParameter('section', $section);
    $request->setRouteResolver(fn () => $route);
    $validator = Validator::make($input, $request->rules(), $request->messages(), $request->attributes());
    $failed = $validator->fails();
    $validation[] = [
        'section' => $section,
        'input' => $input,
        'errors' => $failed ? $validator->errors()->toArray() : (object) [],
        'settings' => $failed ? null : $request->replace($input)->settings(),
    ];
}

file_put_contents($output, json_encode(['urls' => $urlCases, 'validation' => $validation], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
