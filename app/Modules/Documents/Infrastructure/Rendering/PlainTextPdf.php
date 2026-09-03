<?php

namespace App\Modules\Documents\Infrastructure\Rendering;

/**
 * PDF mínimo de texto plano, sin dependencias: una fuente Helvetica y saltos por
 * página. Sirve como respaldo verificable mientras el PDF con formato completo
 * queda pendiente de decisión (DOC: motor de PDF).
 */
class PlainTextPdf
{
    /** @param list<string> $lines */
    public function write(array $lines): string
    {
        $wrapped = [];
        foreach ($lines as $line) {
            $parts = $line === '' ? [''] : explode("\n", wordwrap($line, 92));
            array_push($wrapped, ...$parts);
        }
        $pages = array_chunk($wrapped === [] ? [''] : $wrapped, 52);
        $pageCount = count($pages);
        $fontObject = 3 + ($pageCount * 2);
        $objects = [
            1 => '<< /Type /Catalog /Pages 2 0 R >>',
            2 => '<< /Type /Pages /Count '.$pageCount.' /Kids ['
                .implode(' ', array_map(fn (int $index): string => (3 + ($index * 2)).' 0 R', array_keys($pages))).'] >>',
        ];
        foreach ($pages as $index => $pageLines) {
            $pageObject = 3 + ($index * 2);
            $contentObject = $pageObject + 1;
            $stream = "BT\n/F1 10 Tf\n50 790 Td\n14 TL\n";
            foreach ($pageLines as $line) {
                $stream .= '('.$this->text($line).") Tj\nT*\n";
            }
            $stream .= 'ET';
            $objects[$pageObject] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
                .'/Resources << /Font << /F1 '.$fontObject.' 0 R >> >> /Contents '.$contentObject.' 0 R >>';
            $objects[$contentObject] = '<< /Length '.strlen($stream).">>\nstream\n{$stream}\nendstream";
        }
        $objects[$fontObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        ksort($objects);

        $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [0];
        foreach ($objects as $number => $object) {
            $offsets[$number] = strlen($pdf);
            $pdf .= "{$number} 0 obj\n{$object}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= 'xref'."\n0 ".(count($objects) + 1)."\n";
        $pdf .= "0000000000 65535 f \n";
        for ($number = 1; $number <= count($objects); $number++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$number]);
        }
        $pdf .= 'trailer'."\n<< /Size ".(count($objects) + 1).' /Root 1 0 R >>'
            ."\nstartxref\n{$xref}\n%%EOF\n";

        return $pdf;
    }

    private function text(string $value): string
    {
        $encoded = mb_convert_encoding($value, 'Windows-1252', 'UTF-8');
        $encoded = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $encoded) ?? '';

        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $encoded);
    }
}
