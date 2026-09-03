<?php

namespace App\Modules\Documents\Infrastructure\Rendering;

use App\Modules\Documents\Application\SyllabusDocumentContent;
use App\Modules\Documents\Domain\Contracts\DocumentRenderer;
use App\Modules\Documents\Domain\Data\DocumentBundle;
use App\Modules\Documents\Domain\Data\DocumentRenderInput;
use App\Modules\Documents\Domain\Data\RenderedDocument;
use PhpOffice\PhpWord\IOFactory;
use RuntimeException;
use ZipArchive;

/**
 * DOCX con formato completo vía PhpWord (I-34) y PDF de texto plano de respaldo.
 * Los bytes son reproducibles: fechas fijas en el documento y en el paquete ZIP.
 */
class PhpWordDocumentRenderer implements DocumentRenderer
{
    public const VERSION = 'phpword-docx-v2+text-pdf-v1';

    /** Marca de tiempo fija para las entradas del ZIP (1980-01-01, la mínima válida). */
    private const ZIP_MTIME = 315532800;

    public function __construct(
        private readonly SyllabusWordDocument $document,
        private readonly SyllabusDocumentContent $content,
        private readonly PlainTextPdf $pdf,
    ) {}

    public function version(): string
    {
        return self::VERSION;
    }

    public function render(DocumentRenderInput $input): DocumentBundle
    {
        return new DocumentBundle(
            docx: new RenderedDocument(
                format: 'docx',
                mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                extension: 'docx',
                bytes: $this->docx($input),
            ),
            pdf: new RenderedDocument(
                format: 'pdf',
                mime: 'application/pdf',
                extension: 'pdf',
                bytes: $this->pdf->write($this->content->lines($input)),
            ),
        );
    }

    private function docx(DocumentRenderInput $input): string
    {
        $temporary = tempnam(sys_get_temp_dir(), 'silabos-docx-');
        if ($temporary === false) {
            throw new RuntimeException('No se pudo preparar el documento DOCX.');
        }

        try {
            IOFactory::createWriter($this->document->build($input), 'Word2007')->save($temporary);

            $zip = new ZipArchive;
            if ($zip->open($temporary) !== true) {
                throw new RuntimeException('No se pudo releer el documento DOCX.');
            }
            // PhpWord sortea el `nsid` de cada lista: se reemplaza por uno secuencial.
            $numbering = $zip->getFromName('word/numbering.xml');
            if (is_string($numbering)) {
                $counter = 0;
                $stable = preg_replace_callback(
                    '/<w:nsid w:val="[0-9A-F]{8}"\/>/',
                    function () use (&$counter): string {
                        return sprintf('<w:nsid w:val="%08X"/>', 0x51_1A_B0_00 + $counter++);
                    },
                    $numbering,
                );
                if (is_string($stable)) {
                    $zip->addFromString('word/numbering.xml', $stable);
                }
            }
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $zip->setMtimeIndex($index, self::ZIP_MTIME);
            }
            $zip->close();

            $bytes = file_get_contents($temporary);
            if ($bytes === false) {
                throw new RuntimeException('No se pudo leer el documento DOCX generado.');
            }

            return $bytes;
        } finally {
            @unlink($temporary);
        }
    }
}
