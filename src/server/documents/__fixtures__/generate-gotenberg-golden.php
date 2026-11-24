<?php
$backend = $argv[1] ?? '';
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$converter = app(App\Modules\Documents\Infrastructure\Rendering\GotenbergPdfConverter::class);
$cases = [
  ["%PDF-1.7\n/CreationDate (D:20261124053012+00'00')\n/ModDate(D:20261124053012Z)\ntrailer << /ID [ <0123456789ABCDEF0123456789ABCDEF> <0123456789ABCDEF0123456789ABCDEF> ] >>\n%%EOF\n", "PK docx uno", "2026-11-20T12:00:00+00:00"],
  ["%PDF-1.4\n/CreationDate(D:20200101000000-05'00')/ModDate (D:20200101000000-05'00')\n/ID[<abc123><DEF4567890>]\n/ID [ <00> <11> ]\n%%EOF\n", "PK docx dos \xff\x00", "2026-01-02T03:04:05-05:00"],
  ["%PDF-1.7\nsin fechas\n%%EOF\n", "PK", "no es una fecha"],
];
$out = [];
foreach ($cases as [$pdf, $docx, $generatedAt]) {
  $out[] = ['pdf' => base64_encode($pdf), 'docx' => base64_encode($docx), 'generated_at' => $generatedAt, 'expected' => base64_encode($converter->stabilize($pdf, $docx, $generatedAt))];
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
