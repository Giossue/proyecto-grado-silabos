<?php
$backend = $argv[1] ?? '';
$out = rtrim($argv[2] ?? '', '/');
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Modules\Academic\Domain\FichaWorkbookDefinition;
use App\Modules\Academic\Infrastructure\Spreadsheets\FichaWorkbook;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\RichText\RichText;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

$cell = fn (string $type, string $text): array => ['type' => $type, 'attrs' => ['colspan' => 1, 'rowspan' => 1], 'content' => [$text === '' ? ['type' => 'paragraph'] : ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];
$row = fn (array $cells): array => ['type' => 'tableRow', 'content' => $cells];
$listTable = ['type' => 'table', 'content' => [
    $row([$cell('tableHeader', 'Resultado'), $cell('tableHeader', 'Nivel')]),
    $row([$cell('tableCell', ''), $cell('tableCell', '')]),
]];
$fixedTable = ['type' => 'table', 'content' => [
    $row([$cell('tableHeader', 'Competencia'), $cell('tableHeader', 'Aporte')]),
    $row([$cell('tableCell', 'Resuelve sistemas lineales'), $cell('tableCell', '')]),
    $row([$cell('tableCell', 'Comunica resultados & <datos>'), $cell('tableCell', '')]),
]];
$hash = fn (string $seed): string => hash('sha256', $seed);
$fields = [
    ['key' => 'descripcion', 'label' => 'Descripción de la asignatura', 'columns' => [], 'table' => null, 'id' => '01a2092c-0000-7000-8000-00000000f001', 'section' => '2. Descripción', 'sheet' => '01 Descripción de la asignatura', 'definition_hash' => $hash('a')],
    ['key' => 'objetivos_especificos', 'label' => 'Objetivos específicos', 'columns' => [], 'table' => null, 'id' => '01a2092c-0000-7000-8000-00000000f002', 'section' => '3. Objetivos', 'sheet' => '02 Objetivos específicos', 'definition_hash' => $hash('b')],
    ['key' => 'relacion', 'label' => 'Relación de resultados', 'columns' => ['Resultado', 'Nivel'], 'table' => $listTable, 'id' => '01a2092c-0000-7000-8000-00000000f003', 'section' => '9. Relación', 'sheet' => '03 Relación de resultados', 'definition_hash' => $hash('c')],
    ['key' => 'contribucion', 'label' => 'Contribución al perfil', 'columns' => ['Competencia', 'Aporte'], 'table' => $fixedTable, 'id' => '01a2092c-0000-7000-8000-00000000f004', 'section' => '10. Perfil', 'sheet' => '04 Contribución al perfil', 'definition_hash' => $hash('d')],
    ['key' => 'libre', 'label' => 'Tabla sin plantilla', 'columns' => ['Uno', 'Dos'], 'table' => null, 'id' => '01a2092c-0000-7000-8000-00000000f005', 'section' => '', 'sheet' => '05 Tabla sin plantilla', 'definition_hash' => $hash('e')],
];
$subjects = [
    ['id' => '01a1c5bc-0000-7000-8000-0000000000a1', 'code' => 'SW-101', 'name' => 'Álgebra lineal', 'cycle' => 1],
    ['id' => '01a1c5bc-0000-7000-8000-0000000000a2', 'code' => 'SW-102', 'name' => 'Programación & datos', 'cycle' => 1],
    ['id' => '01a1c5bc-0000-7000-8000-0000000000a3', 'code' => 'SW-201', 'name' => 'Seminario', 'cycle' => null],
];
$definition = new FichaWorkbookDefinition('01a1c5bc-0000-7000-8000-00000000c001', 'Ingeniería de Software', $fields, $subjects);
$workbook = app(FichaWorkbook::class);

function bytes(Spreadsheet $book): string
{
    $path = tempnam(sys_get_temp_dir(), 'ficha-');
    (new Xlsx($book))->setPreCalculateFormulas(false)->save($path);
    $book->disconnectWorksheets();
    $content = (string) file_get_contents($path);
    unlink($path);

    return $content;
}

function edit(string $content, array $parts): string
{
    $path = tempnam(sys_get_temp_dir(), 'ficha-');
    file_put_contents($path, $content);
    $zip = new ZipArchive;
    $zip->open($path);
    foreach ($parts as $name => $change) {
        $zip->addFromString($name, $change((string) $zip->getFromName($name)));
    }
    $zip->close();
    $result = (string) file_get_contents($path);
    unlink($path);

    return $result;
}

file_put_contents("$out/ficha-template.xlsx", bytes($workbook->create($definition)));
$sheet = fn (Spreadsheet $book, int $index) => $book->getSheetByName($fields[$index]['sheet']);
$cases = [];
$book = fn (callable $change): string => (function () use ($workbook, $definition, $change): string {
    $book = $workbook->create($definition);
    $change($book);

    return bytes($book);
})();
$fill = function (Spreadsheet $book) use ($sheet): void {
    $sheet($book, 0)->setCellValueExplicit('D4', "Descripción en Excel\r\nSegunda línea", DataType::TYPE_STRING);
    $sheet($book, 1)->setCellValue('D5', "- Analizar.\n- Aplicar.");
    $sheet($book, 2)->fromArray([['Resuelve problemas', 'Alto'], ['', ''], ['Comunica', '']], null, 'D4');
    $sheet($book, 3)->setCellValue('E8', 'Alta (A)');
    $sheet($book, 4)->fromArray([['x', 'y']], null, 'D84');
};
$cases['filled'] = $book($fill);
$cases['values'] = $book(function (Spreadsheet $book) use ($sheet): void {
    $sheet($book, 0)->setCellValueExplicit('D4', 12.5, DataType::TYPE_NUMERIC);
    $sheet($book, 0)->setCellValueExplicit('D5', 1.0E+20, DataType::TYPE_NUMERIC);
    $sheet($book, 0)->setCellValueExplicit('D6', true, DataType::TYPE_BOOL);
    $rich = new RichText;
    $rich->createText('Texto ');
    $rich->createTextRun('enriquecido')->getFont()?->setBold(true);
    $sheet($book, 1)->setCellValue('D4', $rich);
    $sheet($book, 1)->setCellValue('D6', "• uno\n2) dos\n3. tres");
    $sheet($book, 2)->setCellValueExplicit('D44', 7, DataType::TYPE_NUMERIC);
    $sheet($book, 2)->setCellValueExplicit('E44', 0.30000000000000004, DataType::TYPE_NUMERIC);
});
$cases['formula'] = $book(fn (Spreadsheet $book) => $sheet($book, 0)->setCellValue('D5', '=1+2'));
$cases['formula_guide'] = $book(fn (Spreadsheet $book) => $book->getSheetByName('Indicaciones')->setCellValue('B3', '=A1'));
$cases['renamed_sheet'] = $book(fn (Spreadsheet $book) => $sheet($book, 1)->setTitle('02 Otro nombre'));
$cases['extra_row'] = $book(function (Spreadsheet $book) use ($sheet, $fill): void {
    $fill($book);
    $sheet($book, 0)->setCellValue('D7', 'Fuera');
});
$cases['extra_column'] = $book(function (Spreadsheet $book) use ($sheet, $fill): void {
    $fill($book);
    $sheet($book, 0)->setCellValue('E4', 'Fuera');
});
$cases['header_changed'] = $book(function (Spreadsheet $book) use ($sheet, $fill): void {
    $fill($book);
    $sheet($book, 2)->setCellValue('E3', 'Otro');
});
$cases['code_changed'] = $book(function (Spreadsheet $book) use ($sheet, $fill): void {
    $fill($book);
    $sheet($book, 3)->setCellValue('B6', 'SW-999');
});
$cases['title_changed'] = $book(function (Spreadsheet $book) use ($sheet, $fill): void {
    $fill($book);
    $sheet($book, 1)->setCellValue('B2', 'Otra sección');
});
$cases['fixed_changed'] = $book(function (Spreadsheet $book) use ($sheet, $fill): void {
    $fill($book);
    $sheet($book, 3)->setCellValue('D9', 'Comunica otra cosa');
});
$cases['too_long'] = $book(fn (Spreadsheet $book) => $sheet($book, 0)->setCellValue('D5', str_repeat('a', 12001)));
$cases['table_too_long'] = $book(fn (Spreadsheet $book) => $sheet($book, 2)->setCellValue('D4', str_repeat('é', 1501)));
$cases['list_too_long'] = $book(fn (Spreadsheet $book) => $sheet($book, 0)->setCellValue('D4', implode("\n", array_map(fn (int $i): string => "- item $i", range(1, 61)))));
$cases['blank_list'] = $book(fn (Spreadsheet $book) => $sheet($book, 0)->setCellValue('D4', "- \f"));
$cases['empty'] = $book(fn (Spreadsheet $book) => null);
$cases['wrong_structure'] = $book(function (Spreadsheet $book) use ($fill): void {
    $fill($book);
    $book->getSheetByName('_estructura')->setCellValue('B3', str_repeat('0', 64));
});
$cases['wrong_career'] = $book(function (Spreadsheet $book) use ($fill): void {
    $fill($book);
    $book->getSheetByName('_estructura')->setCellValue('B2', '01a1c5bc-0000-7000-8000-00000000c002');
});
$filled = $cases['filled'];
$cases['not_zip'] = str_repeat('no es un zip ', 40);
$cases['no_workbook'] = (function (): string {
    $path = tempnam(sys_get_temp_dir(), 'ficha-');
    $zip = new ZipArchive;
    $zip->open($path, ZipArchive::OVERWRITE);
    $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
    $zip->close();
    $content = (string) file_get_contents($path);
    unlink($path);

    return $content;
})();
$cases['broken_sheet_xml'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => substr($xml, 0, -40)]);
$cases['missing_shared_string'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => str_replace('<c r="D5" s="4"/>', '<c r="D5" s="4" t="s"><v>9999</v></c>', $xml)]);
$cases['inline_string'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => str_replace('<c r="D5" s="4"/>', '<c r="D5" s="4" t="inlineStr"><is><t>Texto en línea</t></is></c>', $xml)]);
$cases['escaped_text'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => str_replace('<c r="D5" s="4"/>', '<c r="D5" s="4" t="inlineStr"><is><r><t>Uno_x0009_dos_x005F_x0001_</t></r><r><rPr><b/></rPr><t xml:space="preserve"> tres_x000D_</t></r></is></c>', $xml)]);
$cases['untyped_formula'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => str_replace('<c r="D5" s="4"/>', '<c r="D5" s="4"><f>SUM(1,2)</f><v>3</v></c>', $xml)]);
$cases['bool_error'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => str_replace(['<c r="D5" s="4"/>', '<c r="D6" s="4"/>'], ['<c r="D5" s="4" t="b"><v>0</v></c>', '<c r="D6" s="4" t="e"><v>#N/A</v></c>'], $xml)]);
$cases['untyped_number'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => str_replace(['<c r="D5" s="4"/>', '<c r="D6" s="4"/>'], ['<c r="D5" s="4"><v> 007 </v></c>', '<c r="D6" s="4" t="str"><v>Cadena</v></c>'], $xml)]);
$cases['merge_outside'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => str_replace('<mergeCell ref="B1:D1"/>', '<mergeCell ref="B1:D1"/><mergeCell ref="F20:G22"/>', $xml)]);
$cases['styled_cell_outside'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => str_replace('<c r="D4" s="4" t="s">', '<c r="E2" s="1"/><c r="D4" s="4" t="s">', $xml)]);
$cases['late_row_out_of_order'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => str_replace('<row r="1" ', '<row r="40"><c r="A40" s="1"/></row><row r="1" ', $xml)]);
$cases['doctype'] = edit($filled, ['xl/workbook.xml' => fn (string $xml): string => str_replace('<workbook ', '<!DOCTYPE workbook><workbook ', $xml)]);
$cases['broken_workbook_xml'] = edit($filled, ['xl/workbook.xml' => fn (string $xml): string => substr($xml, 0, 200)]);
$cases['sheet_order'] = edit($filled, ['xl/workbook.xml' => fn (string $xml): string => preg_replace('/(<sheet name="01[^>]*\/>)(<sheet name="02[^>]*\/>)/', '$2$1', $xml)]);
$cases['data_validation_outside'] = edit($filled, ['xl/worksheets/sheet3.xml' => fn (string $xml): string => str_replace('<printOptions', '<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="J30:J31"><formula1>"a,b"</formula1></dataValidation></dataValidations><printOptions', $xml)]);
$cases['crlf_shared'] = edit($filled, ['xl/sharedStrings.xml' => fn (string $xml): string => str_replace('Segunda línea', 'Segunda&#13;&#10;tercera', $xml)]);

$golden = ['definition' => ['careerId' => $definition->careerId, 'careerName' => $definition->careerName, 'fields' => $fields, 'subjects' => $subjects, 'fingerprint' => $definition->fingerprint()], 'cases' => []];
foreach ($cases as $name => $content) {
    file_put_contents("$out/reader/$name.xlsx", $content);
    $path = tempnam(sys_get_temp_dir(), 'ficha-');
    file_put_contents($path, $content);
    try {
        $golden['cases'][$name] = ['subjects' => $workbook->read($path, $definition)];
    } catch (ValidationException $exception) {
        $golden['cases'][$name] = ['errors' => $exception->errors()];
    }
    unlink($path);
}
file_put_contents("$out/ficha-golden.json", json_encode($golden, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");
