<?php

namespace Tests\Architecture;

use Illuminate\Database\Eloquent\Model;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * I-28: los identificadores del esquema son 100 % español. Todo modelo Eloquent debe
 * declarar sus marcas de tiempo en español y no puede volver a introducir claves
 * inglesas en `$fillable`. Las siglas técnicas (id, uuid, mime, url, ip) no cuentan.
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

    public function test_todos_los_modelos_declaran_marcas_de_tiempo_en_espanol(): void
    {
        foreach ($this->modelos() as $modelo) {
            $instancia = $modelo->newInstanceWithoutConstructor();
            \assert($instancia instanceof Model);

            $creado = $instancia->getCreatedAtColumn();
            $actualizado = $instancia->getUpdatedAtColumn();

            $this->assertContains(
                $creado,
                ['creado_en', 'registrado_en'],
                $modelo->getName().' debe declarar CREATED_AT en español.',
            );
            $this->assertContains(
                $actualizado,
                ['actualizado_en', null],
                $modelo->getName().' debe declarar UPDATED_AT en español o nulo.',
            );
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
