<?php
$backend = $argv[1] ?? '';
$dir = rtrim($argv[2] ?? '', '/');
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Modules\Configuration\Application\InstitutionalLogos;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Validator;

function pixels(string $png): string {
    $image = imagecreatefromstring($png);
    $bytes = '';
    for ($y = 0; $y < imagesy($image); $y++) {
        for ($x = 0; $x < imagesx($image); $x++) {
            $color = imagecolorat($image, $x, $y);
            $bytes .= chr(($color >> 16) & 0xff).chr(($color >> 8) & 0xff).chr($color & 0xff).chr(($color >> 24) & 0x7f);
        }
    }
    return hash('sha256', $bytes);
}

$golden = [];
foreach (scandir($dir) as $name) {
    if ($name[0] === '.') continue;
    $path = "{$dir}/{$name}";
    $file = new UploadedFile($path, $name, null, null, true);
    $entry = [];
    foreach (['faculty' => [['nullable', ...InstitutionalLogos::rules(InstitutionalLogos::FACULTY)], 'logotipo'], 'institution' => [['required', ...InstitutionalLogos::rules(InstitutionalLogos::INSTITUTION)], 'imagen del logo']] as $kind => [$rules, $label]) {
        $validator = Validator::make(['logo' => $file], ['logo' => $rules], [], ['logo' => $label]);
        $entry["{$kind}_errors"] = $validator->errors()->get('logo');
    }
    foreach (['faculty' => InstitutionalLogos::FACULTY, 'institution' => InstitutionalLogos::INSTITUTION] as $kind => $size) {
        try {
            $entry["{$kind}_pixels"] = pixels(InstitutionalLogos::fit($file, $size));
        } catch (Throwable $exception) {
            $entry["{$kind}_pixels"] = 'error: '.$exception->getMessage();
        }
    }
    $golden[$name] = $entry;
}
foreach (['texto' => 'abc', 'vacio' => null] as $name => $value) {
    $validator = Validator::make(['logo' => $value], ['logo' => ['required', ...InstitutionalLogos::rules(InstitutionalLogos::INSTITUTION)]], [], ['logo' => 'imagen del logo']);
    $golden["valor:{$name}"] = ['institution_errors' => $validator->errors()->get('logo')];
}
echo json_encode($golden, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
