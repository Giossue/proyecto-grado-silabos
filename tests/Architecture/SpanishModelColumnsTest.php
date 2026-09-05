<?php

namespace Tests\Architecture;

use Illuminate\Database\Eloquent\Model;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * I-28: los identificadores del esquema son 100 % español. Todo modelo Eloquent debe
 * no puede volver a introducir marcas técnicas genéricas ni claves inglesas en
 * `$fillable`. Las siglas técnicas (id, uuid, mime, url, ip) no cuentan.
 */
class SpanishModelColumnsTest extends TestCase
{
    /** @var list<string> */
    private const PARTES_INGLESAS = [
        'created', 'updated', 'deleted', 'name', 'email', 'password', 'active', 'status',
        'type', 'queue', 'payload', 'attempts', 'progress', 'started', 'finished',
        'locale', 'snapshot', 'lock', 'token', 'key', 'value', 'owner', 'expiration',
        'user', 'agent', 'activity', 'connection', 'exception', 'failed', 'batch',
        'remember', 'secret', 'recovery', 'must', 'change', 'resource', 'correlation',
        'gateway', 'renderer', 'message', 'code', 'last', 'read',
    ];

    public function test_los_modelos_solo_automatizan_fechas_funcionales_explicitas(): void
    {
        $fechasFuncionales = ['asignado_en', 'encolado_en', 'notificado_en', 'almacenado_en', 'observado_en'];

        foreach ($this->modelos() as $modelo) {
            $instancia = $modelo->newInstanceWithoutConstructor();
            \assert($instancia instanceof Model);

            if (! $instancia->usesTimestamps()) {
                continue;
            }

            $this->assertContains($instancia->getCreatedAtColumn(), $fechasFuncionales);
            $this->assertNull($instancia->getUpdatedAtColumn());
        }
    }

    public function test_ningun_modelo_reintroduce_claves_inglesas_en_fillable(): void
    {
        foreach ($this->modelos() as $modelo) {
            $instancia = $modelo->newInstanceWithoutConstructor();
            \assert($instancia instanceof Model);

            foreach ($instancia->getFillable() as $columna) {
                foreach (explode('_', $columna) as $parte) {
                    $this->assertNotContains(
                        $parte,
                        self::PARTES_INGLESAS,
                        $modelo->getName()." declara la columna '{$columna}' con la palabra inglesa '{$parte}'.",
                    );
                }
            }
        }
    }

    /** @return list<ReflectionClass<Model>> */
    private function modelos(): array
    {
        $raiz = dirname(__DIR__, 2);
        $rutas = array_merge(
            glob("{$raiz}/app/Models/*.php") ?: [],
            glob("{$raiz}/app/Modules/*/Infrastructure/Persistence/Models/*.php") ?: [],
        );

        $modelos = [];
        foreach ($rutas as $ruta) {
            $relativa = str_replace([$raiz.'/app/', '.php', '/'], ['App/', '', '\\'], $ruta);
            $clase = str_replace('App\\', 'App\\', $relativa);
            if (! class_exists($clase)) {
                continue;
            }
            $reflexion = new ReflectionClass($clase);
            if ($reflexion->isAbstract() || ! $reflexion->isSubclassOf(Model::class)) {
                continue;
            }
            $modelos[] = $reflexion;
        }

        $this->assertGreaterThan(40, count($modelos), 'El inventario de modelos parece incompleto.');

        return $modelos;
    }
}
