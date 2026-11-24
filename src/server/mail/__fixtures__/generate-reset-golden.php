<?php

$backend = $argv[1] ?? '';
$output = $argv[2] ?? __DIR__.'/reset-password-golden.json';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;

$appConfig = ['name' => 'Sílabos UEB', 'frontendUrl' => 'http://localhost:3000', 'locale' => 'es'];
$from = ['address' => 'no-reply@example.test', 'name' => 'Sílabos UEB'];
config([
    'mail.default' => 'array',
    'mail.from' => $from,
    'app.name' => $appConfig['name'],
    'app.frontend_url' => $appConfig['frontendUrl'],
    'app.locale' => $appConfig['locale'],
]);

$cases = [
    ['to' => 'docente@example.test', 'token' => str_repeat('a1b2c3d4', 8), 'frontendUrl' => 'http://localhost:3000', 'name' => 'Sílabos UEB'],
    ['to' => 'ana+prueba@example.test', 'token' => 'f00d'.str_repeat('9', 60), 'frontendUrl' => 'http://localhost:3000/', 'name' => 'Sílabos UEB'],
    ['to' => "o'brien&co@ejemplo.test", 'token' => 'x y<z>&"q"', 'frontendUrl' => 'https://silabos.ueb.edu.ec', 'name' => 'Sílabos & <UEB>'],
];

$mailer = app('mail.manager')->mailer('array');
$result = ['from' => $from, 'cases' => []];
foreach ($cases as $case) {
    config(['app.frontend_url' => $case['frontendUrl'], 'app.name' => $case['name']]);
    $user = (new User)->forceFill(['correo_electronico' => $case['to']]);
    $user->notifyNow(new ResetPassword($case['token']));
    $email = $mailer->getSymfonyTransport()->messages()->last()->getOriginalMessage();
    $result['cases'][] = [
        'app' => ['name' => $case['name'], 'frontendUrl' => $case['frontendUrl'], 'locale' => $appConfig['locale']],
        'mail' => ['mailable' => 'resetPassword', 'to' => $case['to'], 'data' => ['token' => $case['token'], 'email' => $case['to'], 'expireMinutes' => 60]],
        'expected' => [
            'subject' => $email->getSubject(),
            'to' => array_map(fn ($address) => ['address' => $address->getAddress(), 'name' => $address->getName()], $email->getTo()),
            'headers' => (object) [],
            'html' => $email->getHtmlBody(),
            'text' => $email->getTextBody(),
        ],
    ];
}
file_put_contents($output, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
