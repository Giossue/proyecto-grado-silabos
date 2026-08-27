# Módulos y límites

## Estructura interna sugerida

```text
app/Modules/Syllabi/
├── Application/
│   ├── Actions/
│   ├── Data/
│   ├── Queries/
│   └── Contracts/
├── Domain/
│   ├── Entities/
│   ├── Enums/
│   ├── Events/
│   ├── Exceptions/
│   ├── Policies/
│   └── ValueObjects/
├── Infrastructure/
│   ├── Persistence/
│   ├── Jobs/
│   └── Providers/
└── Presentation/
    └── Http/
        ├── Controllers/
        ├── Requests/
        └── Resources/
```

No crees carpetas vacías por simetría. Aplica la capa cuando exista una responsabilidad
real.

## Dependencias permitidas

| Módulo | Puede depender de |
|---|---|
| Identidad | soporte común |
| Académico | identidad (IDs/contratos), soporte |
| Configuración | identidad, académico mediante contratos |
| Convocatorias | académico, configuración, identidad |
| Sílabos | académico, configuración, convocatorias, identidad |
| Revisión | sílabos, identidad |
| Validación | sílabos/configuración mediante DTO/contratos |
| IA | sílabos, configuración/fuentes mediante contratos |
| Documentos | sílabos, configuración mediante snapshots/contratos |
| Operaciones | eventos/DTO públicos de módulos |

Evita ciclos. Si dos módulos se necesitan mutuamente, extrae un contrato público, un
evento o revisa el límite.

## Contratos públicos

Un módulo expone solo:

- acciones/casos de uso invocables;
- DTO de entrada/salida estables;
- consultas autorizadas;
- eventos de dominio/aplicación;
- interfaces que la infraestructura implementa.

No expone consultas ad hoc sobre sus tablas, modelos Eloquent mutables ni lógica interna.

## Eventos recomendados

- `CampaignOpened`
- `SyllabusDraftCreated`
- `SyllabusSubmitted`
- `CorrectionsRequested`
- `SyllabusResubmitted`
- `SyllabusApproved`
- `ApprovedSyllabusReopened`
- `TemplateVersionPublished`
- `SourceVersionActivated`
- `ExportRequested`
- `ImportCompleted`

Los nombres representan hechos ya confirmados. Efectos externos se procesan después del
commit y pueden usar outbox.

## Soporte común

`app/Support` solo contiene preocupaciones verdaderamente transversales: UUID, reloj,
idempotencia, paginación, trazas y resultados. No se convierte en un módulo “cajón”.

