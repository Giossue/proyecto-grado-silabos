<?php
$backend = $argv[1] ?? '';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Modules\Documents\Application\CmsSignatureVerifier;
use App\Modules\Documents\Application\SignerHolderMatcher;
use Illuminate\Validation\ValidationException;
$input = json_decode(file_get_contents($argv[2]), true);
$bundles = ['none' => null, 'root' => $argv[3].'/ca.pem', 'intermediate' => $argv[3].'/sub.pem'];
$now = time();
$results = [];
foreach ($input['cases'] as $case) {
  $outcomes = [];
  foreach ($bundles as $label => $bundle) {
    config(['signatures.trusted_ca_bundle' => $bundle]);
    try {
      $certificate = app(CmsSignatureVerifier::class)->verify($case['content'], $case['cms']);
      $outcomes[$label] = ['holder' => $certificate->holder, 'serial' => $certificate->serial, 'issuer' => $certificate->issuer, 'valid_to' => $certificate->validTo->toIso8601String()];
    } catch (ValidationException $exception) {
      $outcomes[$label] = ['error' => $exception->errors()['signature'][0]];
    }
  }
  $results[] = [...$case, 'outcomes' => $outcomes];
}
$matcher = new SignerHolderMatcher;
$names = [
  ['ANA MARÍA PÉREZ LÓPEZ', 'Ana María Pérez López'], ['PÉREZ LÓPEZ ANA MARÍA', 'Ana María Pérez López'], ['ANA PEREZ', 'Ana María Pérez López'],
  ['ANA', 'Ana'], ['', 'Ana Pérez'], ['José-Luis O\'Neil', 'jose luis o neil'], ['MUÑOZ ÑAÑEZ', 'Muñoz Ñañez'], ['ANA ANA PEREZ', 'Ana Perez'],
  ['Łukasz Øster Æbel', 'Lukasz Oster Aebel'], ['STRAẞE GROß', 'strasse gross'], ["ANA\tPÉREZ", "Ana  Pérez"], ['123 456', '123 456'],
  ['Ç Ü ß', 'C U ss'], ['ANA PÉREZ', 'ANA PEREZ'], ['ana pérez', 'ANA PÉREZ LÓPEZ'], ['Zoë Saldaña', 'ZOE SALDANA'], ['André Ørsted', 'ANDRE ORSTED'],
];
$holders = array_map(fn ($pair) => ['holder' => $pair[0], 'account' => $pair[1], 'matches' => $matcher->matches($pair[0], $pair[1])], $names);
echo json_encode(['now' => $now, 'statement' => $input['statement'], 'cases' => $results, 'holders' => $holders, 'authorities' => ['root' => file_get_contents($argv[3].'/ca.pem'), 'intermediate' => file_get_contents($argv[3].'/sub.pem')]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
