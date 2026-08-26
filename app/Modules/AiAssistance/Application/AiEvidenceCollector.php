<?php

namespace App\Modules\AiAssistance\Application;

use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceFragment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Support\CanonicalHasher;

class AiEvidenceCollector
{
    public function __construct(private readonly CanonicalHasher $hasher) {}

    /**
     * @return array{
     *   items: list<array{
     *     source_id: string, source_name: string, source_authority: string,
     *     source_version_id: string, source_version: int, fragment_id: string,
     *     fragment_key: string, fragment_title: string, data_key: string|null,
     *     excerpt: string, fingerprint: string
     *   }>,
     *   fingerprint: string,
     *   conflict_keys: list<string>,
     *   too_many: bool
     * }
     */
    public function collect(Syllabus $syllabus): array
    {
        $syllabus->loadMissing('convocation');
        $today = today();
        $versions = $syllabus->convocation->sourceVersions()
            ->where('versiones_fuente.estado', 'active')
            ->where(fn ($query) => $query
                ->whereNull('versiones_fuente.vigente_desde')
                ->orWhere('versiones_fuente.vigente_desde', '<=', $today))
            ->where(fn ($query) => $query
                ->whereNull('versiones_fuente.vigente_hasta')
                ->orWhere('versiones_fuente.vigente_hasta', '>=', $today))
            ->whereHas('source', fn ($query) => $query
                ->where('activo', true)
                ->where('carrera_id', $syllabus->convocation->carrera_id))
            ->with(['source', 'fragments'])
            ->orderBy('versiones_fuente.id')
            ->get();

        $items = [];
        foreach ($versions as $version) {
            foreach ($version->fragments as $fragment) {
                $items[] = $this->snapshot($version, $fragment);
            }
        }

        $conflicts = [];
        $fingerprintsByKey = [];
        foreach ($items as $item) {
            if ($item['data_key'] === null) {
                continue;
            }
            $fingerprintsByKey[$item['data_key']][$item['fingerprint']] = true;
        }
        foreach ($fingerprintsByKey as $key => $fingerprints) {
            if (count($fingerprints) > 1) {
                $conflicts[] = $key;
            }
        }
        sort($conflicts, SORT_STRING);
        $limit = (int) config('ai.limits.evidence_items');

        return [
            'items' => array_slice($items, 0, $limit),
            'fingerprint' => $this->hasher->hash(array_map(fn (array $item): array => [
                'source_version_id' => $item['source_version_id'],
                'fragment_id' => $item['fragment_id'],
                'fingerprint' => $item['fingerprint'],
            ], $items)),
            'conflict_keys' => $conflicts,
            'too_many' => count($items) > $limit,
        ];
    }

    /**
     * @return array{
     *   source_id: string, source_name: string, source_authority: string,
     *   source_version_id: string, source_version: int, fragment_id: string,
     *   fragment_key: string, fragment_title: string, data_key: string|null,
     *   excerpt: string, fingerprint: string
     * }
     */
    private function snapshot(SourceVersion $version, SourceFragment $fragment): array
    {
        $raw = $fragment->contenido;
        if (! is_string($raw)) {
            $raw = $this->hasher->json($fragment->valor_estructurado);
        }

        return [
            'source_id' => $version->fuente_academica_id,
            'source_name' => $version->source->nombre,
            'source_authority' => $version->source->autoridad,
            'source_version_id' => $version->id,
            'source_version' => $version->numero_version,
            'fragment_id' => $fragment->id,
            'fragment_key' => $fragment->clave,
            'fragment_title' => $fragment->titulo,
            'data_key' => $fragment->clave_dato,
            'excerpt' => mb_substr($raw, 0, (int) config('ai.limits.evidence_excerpt_characters')),
            'fingerprint' => $fragment->huella_sha256,
        ];
    }
}
