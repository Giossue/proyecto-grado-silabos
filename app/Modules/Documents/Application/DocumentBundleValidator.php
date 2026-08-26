<?php

namespace App\Modules\Documents\Application;

use App\Modules\Documents\Domain\Data\DocumentBundle;
use DOMDocument;
use RuntimeException;
use ZipArchive;

class DocumentBundleValidator
{
    public function validate(DocumentBundle $bundle): void
    {
        if ($bundle->docx->format !== 'docx'
            || $bundle->docx->mime !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            || ! str_starts_with($bundle->docx->bytes, 'PK')) {
            throw new RuntimeException('El renderer no produjo un DOCX válido.');
        }
        if ($bundle->pdf->format !== 'pdf'
            || $bundle->pdf->mime !== 'application/pdf'
            || ! str_starts_with($bundle->pdf->bytes, '%PDF-')
            || ! str_ends_with($bundle->pdf->bytes, "%%EOF\n")) {
            throw new RuntimeException('El renderer no produjo un PDF válido.');
        }

        $temporary = tempnam(sys_get_temp_dir(), 'silabos-validate-docx-');
        if ($temporary === false || file_put_contents($temporary, $bundle->docx->bytes) === false) {
            throw new RuntimeException('No se pudo validar la estructura DOCX.');
        }
        try {
            $zip = new ZipArchive;
            if ($zip->open($temporary) !== true) {
                throw new RuntimeException('El paquete DOCX no puede abrirse.');
            }
            foreach (['[Content_Types].xml', '_rels/.rels', 'word/document.xml'] as $entry) {
                if ($zip->locateName($entry) === false) {
                    $zip->close();
                    throw new RuntimeException('El paquete DOCX está incompleto.');
                }
            }
            $documentXml = $zip->getFromName('word/document.xml');
            $zip->close();
            if (! is_string($documentXml) || ! $this->isXml($documentXml)) {
                throw new RuntimeException('El contenido principal del DOCX no es XML válido.');
            }
        } finally {
            @unlink($temporary);
        }
    }

    private function isXml(string $xml): bool
    {
        $previous = libxml_use_internal_errors(true);
        $document = new DOMDocument;
        $valid = $document->loadXML($xml, LIBXML_NONET) === true;
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        return $valid;
    }
}
