<?php

$backend = $argv[1] ?? '';
$output = $argv[2] ?? __DIR__.'/mail-golden.json';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Modules\Identity\Infrastructure\Mail\ManagedUserActivationMail;
use App\Modules\Operations\Infrastructure\Mail\CoordinatorSummaryMail;
use App\Modules\Operations\Infrastructure\Mail\DailySummaryMail;
use App\Modules\Operations\Infrastructure\Mail\WorkflowNotificationMail;

$appConfig = ['name' => 'Sílabos UEB', 'frontendUrl' => 'http://localhost:3000', 'locale' => 'es'];
$from = ['address' => 'no-reply@example.test', 'name' => 'Sílabos UEB'];
config([
    'mail.default' => 'array',
    'mail.from' => $from,
    'app.name' => $appConfig['name'],
    'app.frontend_url' => $appConfig['frontendUrl'],
    'app.locale' => $appConfig['locale'],
]);

$tricky = 'José & "Ana" <b>O\'Brien</b> *uno* _dos_ [tres](http://x.test) `c` \\ # ñ &eacute;';
$cases = [
    ['mailable' => 'activation', 'to' => 'docente@example.test', 'data' => ['name' => 'María Pérez', 'roleName' => 'Docente', 'activationUrl' => 'http://localhost:3000/activar-cuenta?token=abc%2Bdef', 'careerName' => 'Ingeniería en Software (Guaranda)']],
    ['mailable' => 'activation', 'to' => 'admin@example.test', 'data' => ['name' => 'Luis Gómez', 'roleName' => 'Administrador', 'activationUrl' => 'http://localhost:3000/activar-cuenta?token=xyz&a=1', 'careerName' => null]],
    ['mailable' => 'activation', 'to' => 'cero@example.test', 'data' => ['name' => 'Ana', 'roleName' => 'Docente', 'activationUrl' => 'http://localhost:3000/activar-cuenta?token=t', 'careerName' => '0']],
    ['mailable' => 'activation', 'to' => 'raro@example.test', 'data' => ['name' => $tricky, 'roleName' => 'Coordinador & <jefe>', 'activationUrl' => 'http://localhost:3000/activar-cuenta?token="q"&x=<y> ñ', 'careerName' => 'Carrera *A* & [B]']],
    ['mailable' => 'workflow', 'to' => 'docente@example.test', 'data' => ['name' => 'María Pérez', 'title' => 'Sílabo devuelto para corrección', 'body' => 'Coordinación pidió corregir el sílabo de «Cálculo I» (Ingeniería en Software). Motivo: falta la bibliografía.', 'url' => 'http://localhost:3000/']],
    ['mailable' => 'workflow', 'to' => 'raro@example.test', 'data' => ['name' => $tricky, 'title' => 'Aviso & <título> "x"', 'body' => "Línea uno.\nLínea dos con *énfasis*.\n\n- punto 1\n- punto 2\n\n# no es título\n\n1. uno\n2. dos\n\n> cita\n\nTexto con <script>alert(1)</script> y https://ejemplo.test y \\[x\\] y \\\\[z]", 'url' => 'http://localhost:3000/?a=1&b=2']],
    ['mailable' => 'workflow', 'to' => 'md@example.test', 'data' => ['name' => 'Ana', 'title' => 'Formato', 'body' => "Motivo:  \nduro\r\nCRLF\r\n\r\n\r\n\r\nmuchas líneas\n\n    código indentado\n\n***\n\nTítulo\n===\n\n![img](http://i.test/a.png \"t\") [mal](javascript:alert(1)) [bien](http://ñ.test/á b) <http://auto.test>\n\n- a\n\n- b\n  - c\n\n10) diez\n\n`a``b` **_x_**\n\n&amp; &copy; &#65;", 'url' => 'http://localhost:3000/']],
    ['mailable' => 'workflow', 'to' => 'fence@example.test', 'data' => ['name' => 'Ana', 'title' => 'Bloque', 'body' => "Antes\n\n```php\nabierto <b>\n\n\nsin cerrar", 'url' => 'http://localhost:3000/']],
    ['mailable' => 'workflow', 'to' => 'unicode@example.test', 'data' => ['name' => "Ana\u{00a0}", 'title' => '', 'body' => "\u{00a0}inicia con espacio duro\u{00a0}\n\n**\u{feff}** y **\u{2003}x** y \u{3000}fin\u{000b}", 'url' => 'http://localhost:3000/']],
    ['mailable' => 'workflow', 'to' => 'cero@example.test', 'data' => ['name' => 'Ana', 'title' => '0', 'body' => '0', 'url' => 'http://localhost:3000/']],
    ['mailable' => 'activation', 'to' => 'bom@example.test', 'data' => ['name' => 'Ana', 'roleName' => "\u{feff}", 'activationUrl' => 'http://localhost:3000/activar-cuenta?token=%7Ca%7Cb%7C', 'careerName' => "\u{feff}"]],
    ['mailable' => 'daily', 'to' => 'docente@example.test', 'data' => ['name' => 'María Pérez', 'lines' => ['Ingeniería en Software: 2 sílabos en borrador.', 'Derecho: 1 sílabo por corregir.'], 'buttonLabel' => 'Abrir mis sílabos', 'url' => 'http://localhost:3000/docente/mis-silabos']],
    ['mailable' => 'daily', 'to' => 'biblio@example.test', 'data' => ['name' => $tricky, 'lines' => ['Uno & <dos>', '*tres* [cuatro]', '1. anidado', '```'], 'buttonLabel' => 'Abrir & <revisiones>', 'url' => 'http://localhost:3000/biblioteca/revisiones']],
    ['mailable' => 'daily', 'to' => 'vacio@example.test', 'data' => ['name' => 'Ana', 'lines' => [], 'buttonLabel' => 'Abrir revisiones', 'url' => 'http://localhost:3000/biblioteca/revisiones']],
    ['mailable' => 'coordinator', 'to' => 'coord@example.test', 'data' => ['name' => 'Carlos Ruiz', 'careers' => [['career' => 'Ingeniería en Software', 'review' => 1], ['career' => 'Derecho', 'review' => 0], ['career' => 'Medicina & <Salud>', 'review' => 3]], 'url' => 'http://localhost:3000/coordinacion/revisiones']],
    ['mailable' => 'coordinator', 'to' => 'coord@example.test', 'data' => ['name' => 'Carlos Ruiz', 'careers' => [['career' => 'Derecho', 'review' => 0]], 'url' => 'http://localhost:3000/coordinacion/revisiones']],
];

$build = fn (array $case) => match ($case['mailable']) {
    'activation' => new ManagedUserActivationMail($case['data']['name'], $case['data']['roleName'], $case['data']['activationUrl'], $case['data']['careerName']),
    'workflow' => new WorkflowNotificationMail($case['data']['name'], $case['data']['title'], $case['data']['body'], $case['data']['url']),
    'daily' => new DailySummaryMail($case['data']['name'], $case['data']['lines'], $case['data']['buttonLabel'], $case['data']['url']),
    'coordinator' => new CoordinatorSummaryMail($case['data']['name'], $case['data']['careers'], $case['data']['url']),
};

$mailer = app('mail.manager')->mailer('array');
$addresses = fn (array $list) => array_map(fn ($address) => ['address' => $address->getAddress(), 'name' => $address->getName()], $list);
$result = ['app' => $appConfig, 'from' => $from, 'cases' => []];
foreach ($cases as $case) {
    $mailable = $build($case);
    $mailable->to($case['to']);
    $mailable->send($mailer);
    $email = $mailer->getSymfonyTransport()->messages()->last()->getOriginalMessage();
    $headers = [];
    foreach (['Importance', 'X-Priority', 'Priority'] as $name) {
        if ($email->getHeaders()->has($name)) {
            $headers[$name] = $email->getHeaders()->get($name)->getBodyAsString();
        }
    }
    $result['cases'][] = [
        'mail' => ['mailable' => $case['mailable'], 'to' => $case['to'], 'data' => $case['data']],
        'expected' => [
            'subject' => $email->getSubject(),
            'from' => $addresses($email->getFrom()),
            'to' => $addresses($email->getTo()),
            'headers' => (object) $headers,
            'html' => $email->getHtmlBody(),
            'text' => $email->getTextBody(),
        ],
    ];
}
file_put_contents($output, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
