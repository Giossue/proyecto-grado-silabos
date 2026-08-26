<?php

namespace App\Modules\Documents\Infrastructure\Rendering;

use App\Modules\Documents\Application\SyllabusDocumentContent;
use App\Modules\Documents\Domain\Contracts\DocumentRenderer;
use App\Modules\Documents\Domain\Data\DocumentBundle;
use App\Modules\Documents\Domain\Data\DocumentRenderInput;
use App\Modules\Documents\Domain\Data\RenderedDocument;
use RuntimeException;
use ZipArchive;

class BaselineDocumentRenderer implements DocumentRenderer
{
    public const VERSION = 'baseline-ooxml-pdf-v1';

    public function __construct(private readonly SyllabusDocumentContent $content) {}

    public function version(): string
    {
        return self::VERSION;
    }

    public function render(DocumentRenderInput $input): DocumentBundle
    {
        $lines = $this->content->lines($input);

        return new DocumentBundle(
            docx: new RenderedDocument(
                format: 'docx',
                mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                extension: 'docx',
                bytes: $this->docx($input, $lines),
            ),
            pdf: new RenderedDocument(
                format: 'pdf',
                mime: 'application/pdf',
                extension: 'pdf',
                bytes: $this->pdf($lines),
            ),
        );
    }

    /** @param list<string> $lines */
    private function docx(DocumentRenderInput $input, array $lines): string
    {
        $temporary = tempnam(sys_get_temp_dir(), 'silabos-docx-');
        if ($temporary === false) {
            throw new RuntimeException('No se pudo preparar el documento DOCX.');
        }

        $zip = new ZipArchive;
        if ($zip->open($temporary, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            @unlink($temporary);
            throw new RuntimeException('No se pudo crear el documento DOCX.');
        }

        $paragraphs = implode('', array_map(
            fn (string $line): string => '<w:p><w:r><w:t xml:space="preserve">'.$this->xml($line).'</w:t></w:r></w:p>',
            $lines,
        ));
        $zip->addFromString('[Content_Types].xml', $this->contentTypesXml());
        $zip->addFromString('_rels/.rels', $this->rootRelationshipsXml());
        $zip->addFromString('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
            .$paragraphs
            .'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>'
            .'</w:body></w:document>');
        $zip->addFromString('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            .'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>'
            .'<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr></w:style></w:styles>');
        $zip->addFromString('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
        $zip->addFromString('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            .'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>'.$this->xml($input->subject).'</dc:title>'
            .'<dc:description>Revisión '.$input->revisionNumber.' · renderer '.$this->version().'</dc:description></cp:coreProperties>');
        $zip->addFromString('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
            .'<Application>Sílabos UEB</Application></Properties>');
        for ($index = 0; $index < $zip->numFiles; $index++) {
            $zip->setMtimeIndex($index, 315532800);
        }
        $zip->close();

        $bytes = file_get_contents($temporary);
        @unlink($temporary);
        if ($bytes === false) {
            throw new RuntimeException('No se pudo leer el documento DOCX generado.');
        }

        return $bytes;
    }

    /** @param list<string> $lines */
    private function pdf(array $lines): string
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
                $stream .= '('.$this->pdfText($line).") Tj\nT*\n";
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

    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private function pdfText(string $value): string
    {
        $encoded = mb_convert_encoding($value, 'Windows-1252', 'UTF-8');
        $encoded = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $encoded) ?? '';

        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $encoded);
    }

    private function contentTypesXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            .'<Default Extension="xml" ContentType="application/xml"/>'
            .'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            .'<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
            .'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
            .'<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
            .'</Types>';
    }

    private function rootRelationshipsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            .'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
            .'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
            .'</Relationships>';
    }
}
