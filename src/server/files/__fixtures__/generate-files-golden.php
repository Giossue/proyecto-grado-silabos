<?php
$backend = $argv[1] ?? '';
$out = rtrim($argv[2] ?? '', '/');
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\OLE;
use PhpOffice\PhpSpreadsheet\Shared\OLE\PPS\File as OleFile;
use PhpOffice\PhpSpreadsheet\Shared\OLE\PPS\Root as OleRoot;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

function save(string $path, string $content): void { file_put_contents($path, $content); }

function filled(int $cells, string $format, bool $styledEmpty): string {
    $book = new Spreadsheet;
    $book->getActiveSheet()->fromArray(array_chunk(range(1, $cells), 20), null, 'A1');
    if ($styledEmpty) {
        $book->createSheet()->setTitle('Formato')->getStyle('A1:Z300')->getFont()->setBold(true);
    }
    $path = tempnam(sys_get_temp_dir(), 'golden-');
    IOFactory::createWriter($book, $format)->save($path);
    $content = (string) file_get_contents($path);
    unlink($path);
    return $content;
}

function workbook(string $format): string {
    $book = new Spreadsheet;
    $book->getActiveSheet()->setTitle('Resumen')->setCellValue('A1', 'Competencia');
    $wide = $book->createSheet()->setTitle('Detalle');
    foreach (range('A', 'L') as $column) {
        $wide->setCellValue("{$column}1", "Columna {$column}");
    }
    $wide->mergeCells('A3:C4');
    $wide->setCellValue('A5', '=1+2');
    $wide->setCellValue('B5', true);
    $path = tempnam(sys_get_temp_dir(), 'golden-');
    IOFactory::createWriter($book, $format)->save($path);
    $content = (string) file_get_contents($path);
    unlink($path);
    return $content;
}

function docx(): string {
    $word = new PhpOffice\PhpWord\PhpWord;
    $word->addSection()->addText('Habilidades blandas');
    $path = tempnam(sys_get_temp_dir(), 'golden-');
    PhpOffice\PhpWord\IOFactory::createWriter($word, 'Word2007')->save($path);
    $content = (string) file_get_contents($path);
    unlink($path);
    return $content;
}

function zip(array $entries): string {
    $path = tempnam(sys_get_temp_dir(), 'golden-');
    $zip = new ZipArchive;
    $zip->open($path, ZipArchive::OVERWRITE);
    foreach ($entries as $name => $content) {
        $zip->addFromString($name, $content);
    }
    $zip->close();
    $content = (string) file_get_contents($path);
    unlink($path);
    return $content;
}

function summary(?string $application): string {
    $properties = [[0x01, pack('vv', 2, 0).pack('v', 1252).pack('v', 0)]];
    if ($application !== null) {
        $text = $application."\0";
        $text .= str_repeat("\0", (4 - strlen($text) % 4) % 4);
        $properties[] = [0x12, pack('V', 0x1e).pack('V', strlen($application) + 1).$text];
    }
    $headerSize = 8 + 8 * count($properties);
    $offsets = '';
    $values = '';
    foreach ($properties as [$id, $value]) {
        $offsets .= pack('VV', $id, $headerSize + strlen($values));
        $values .= $value;
    }
    $section = pack('VV', $headerSize + strlen($values), count($properties)).$offsets.$values;
    $fmtid = hex2bin('e0859ff2f94f6810ab9108002b27b3d9');
    return pack('vvVa16V', 0xfffe, 0, 0x00020006, str_repeat("\0", 16), 1).$fmtid.pack('V', 48).$section;
}

function ole(array $streams): string {
    $children = [];
    foreach ($streams as $name => $content) {
        $file = new OleFile(OLE::ascToUcs($name));
        $file->append($content);
        $children[] = $file;
    }
    $root = new OleRoot(0, 0, $children);
    $handle = fopen('php://memory', 'w+b');
    $root->save($handle);
    rewind($handle);
    $content = (string) stream_get_contents($handle);
    fclose($handle);
    return $content;
}

$big = str_repeat('x', 5000);
$files = [
    'tiny.pdf' => "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF",
    'bom.pdf' => "\xef\xbb\xbf%PDF-1.7\n%%EOF",
    'newline.pdf' => "\n%PDF-1.7\n%%EOF",
    'late.pdf' => str_repeat("\x01", 900)."%PDF-1.7\n%%EOF",
    'too-late.pdf' => str_repeat("\x01", 1100)."%PDF-1.7\n%%EOF",
    'json.pdf' => '{"a":"%PDF-1.4"}',
    'empty.pdf' => '',
    'notes.txt' => 'texto',
    'binary.doc' => "\x00\x01\x02\x03binario",
    'habilidades.docx' => docx(),
    'workbook.xlsx' => workbook('Xlsx'),
    'workbook.xls' => workbook('Xls'),
    'datos-5001.xlsx' => filled(5001, 'Xlsx', false),
    'datos-5000-styled.xlsx' => filled(5000, 'Xlsx', true),
    'datos-5001.xls' => filled(5001, 'Xls', false),
    'datos-5000-styled.xls' => filled(5000, 'Xls', true),
    'plain.zip' => zip(['nota.txt' => 'hola']),
    'rels-first.docx' => zip(['_rels/.rels' => 'r', 'docProps/app.xml' => 'a', 'docProps/core.xml' => 'c', '[Content_Types].xml' => 't', 'word/document.xml' => 'd']),
    'deep.docx' => zip(['[Content_Types].xml' => 't', 'a.xml' => 'a', 'b.xml' => 'b', 'c.xml' => 'c', 'd.xml' => 'd', 'e.xml' => 'e', 'word/document.xml' => 'd']),
    'sixth.xlsx' => zip(['[Content_Types].xml' => 't', 'a.xml' => 'a', 'b.xml' => 'b', 'c.xml' => 'c', 'd.xml' => 'd', 'xl/workbook.xml' => 'w']),
    'gap.xlsx' => zip(['[Content_Types].xml' => 't', 'a.xml' => $big, 'xl/workbook.xml' => 'w']),
    'xl-first.xlsx' => zip(['xl/workbook.xml' => 'w']),
    'word.doc' => ole(['WordDocument' => str_repeat('w', 5000)]),
    'book.xls' => ole(['Book' => str_repeat('b', 100)]),
    'other.doc' => ole(['Contenido' => 'c']),
    'app-word.doc' => ole(["\x05SummaryInformation" => summary('Microsoft Office Word'), 'Datos' => 'd']),
    'app-other.xls' => ole(["\x05SummaryInformation" => summary('Otra Hoja'), 'Workbook' => str_repeat('w', 10)]),
    'app-none.doc' => ole(["\x05SummaryInformation" => summary(null), 'Datos' => 'd']),
    'app-excel.doc' => ole(["\x05SummaryInformation" => summary('Microsoft Excel'), 'WordDocument' => 'w']),
];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$cells = app(App\Modules\Academic\Application\SupportDocumentSpreadsheetCells::class);
$golden = [];
foreach ($files as $name => $content) {
    save("{$out}/{$name}", $content);
    $extension = pathinfo($name, PATHINFO_EXTENSION);
    $golden[$name] = ['mime' => $finfo->buffer($content), 'cells' => $cells->problem("{$out}/{$name}", $extension)];
}
echo json_encode($golden, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
