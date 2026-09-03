<?php

it('mantiene todas las altas de gestion dentro del sheet derecho compartido', function (): void {
    $root = dirname(__DIR__, 2);
    $surfaces = [
        'Administrador · cuentas' => [
            'page' => 'resources/js/pages/Admin/Users/Index.vue',
            'component' => 'ManagedUserSheet',
            'component_file' => 'resources/js/components/domain/identity/ManagedUserSheet.vue',
            'action' => 'ManagedUserController.store.form',
        ],
        'Administrador · asignaciones de rol' => [
            'page' => 'resources/js/pages/Admin/Users/Show.vue',
            'component' => 'RoleAssignmentSheet',
            'component_file' => 'resources/js/components/domain/identity/RoleAssignmentSheet.vue',
            'action' => 'ManagedUserController.assignRole.form',
        ],
        'Administrador · catalogos institucionales' => [
            'page' => 'resources/js/pages/Admin/Academic/Index.vue',
            'component' => 'CatalogRecordSheet',
            'component_file' => 'resources/js/components/domain/academic/CatalogRecordSheet.vue',
            'action' => 'AcademicGovernanceController.store.form',
        ],
        'Administrador · plantillas' => [
            'page' => 'resources/js/pages/Admin/Templates/Index.vue',
            'component' => 'TemplateCreationSheet',
            'component_file' => 'resources/js/components/domain/configuration/TemplateCreationSheet.vue',
            'action' => 'TemplateController.store.form',
        ],
        'Administrador · bloques de plantilla' => [
            'page' => 'resources/js/pages/Admin/Templates/Show.vue',
            'component' => 'TemplateSheetEditor',
            'component_file' => 'resources/js/components/domain/configuration/TemplateSheetEditor.vue',
            'action' => 'TemplateController.storeSection',
            'inline' => true,
            // I-33: la pieza recién soltada queda con el nombre listo para escribirse.
            'success' => "pendingFocus.value = { kind: 'section', key }",
        ],
        'Coordinador · fuentes' => [
            'page' => 'resources/js/pages/Sources/Index.vue',
            'component' => 'AcademicSourceCreationSheet',
            'component_file' => 'resources/js/components/domain/configuration/AcademicSourceCreationSheet.vue',
            'action' => 'AcademicSourceController.store.form',
        ],
        'Coordinador · edición de fuente' => [
            'page' => 'resources/js/pages/Sources/Show.vue',
            'component' => 'AcademicSourceEditSheet',
            'component_file' => 'resources/js/components/domain/configuration/AcademicSourceEditSheet.vue',
            'action' => 'AcademicSourceController.update.form',
        ],
        'Coordinador · mallas' => [
            'page' => 'resources/js/pages/Coordination/Academic/Curricula.vue',
            'component' => 'CurriculumRecordSheet',
            'component_file' => 'resources/js/components/domain/academic/CurriculumRecordSheet.vue',
            'action' => 'CareerAcademicStructureController.store.form',
        ],
        'Coordinador · materias dentro de una malla' => [
            'page' => 'resources/js/pages/Coordination/Academic/CurriculumBuilder.vue',
            'component' => 'CurriculumSubjectSheet',
            'component_file' => 'resources/js/components/domain/academic/curriculum/CurriculumSubjectSheet.vue',
            'action' => 'CareerAcademicStructureController.store.form',
        ],
        'Coordinador · ofertas' => [
            'page' => 'resources/js/pages/Coordination/Academic/Offerings.vue',
            'component' => 'OfferingRecordSheet',
            'component_file' => 'resources/js/components/domain/academic/OfferingRecordSheet.vue',
            'action' => 'CareerAcademicStructureController.store.form',
        ],
        'Coordinador · paralelos' => [
            'page' => 'resources/js/pages/Coordination/Academic/Parallels.vue',
            'component' => 'OfferingRecordSheet',
            'component_file' => 'resources/js/components/domain/academic/OfferingRecordSheet.vue',
            'action' => 'CareerAcademicStructureController.store.form',
        ],
        'Coordinador · asignaciones docentes' => [
            'page' => 'resources/js/pages/Coordination/Academic/TeacherAssignments.vue',
            'component' => 'TeacherAssignmentSheet',
            'component_file' => 'resources/js/components/domain/academic/TeacherAssignmentSheet.vue',
            'action' => 'CareerAcademicStructureController.store.form',
        ],
        'Administrador · calendario de sílabos' => [
            'page' => 'resources/js/pages/Admin/Processes/Index.vue',
            'component' => 'SyllabusProcessSheet',
            'component_file' => 'resources/js/components/domain/syllabus/SyllabusProcessSheet.vue',
            'action' => 'SyllabusProcessController.store.form',
        ],
        'Coordinador · convocatorias' => [
            'page' => 'resources/js/pages/Coordination/Convocations/Index.vue',
            'component' => 'ConvocationCreationSheet',
            'component_file' => 'resources/js/components/domain/syllabus/ConvocationCreationSheet.vue',
            'action' => 'ConvocationController.store.form',
        ],
        'Coordinador · observaciones de revision' => [
            'page' => 'resources/js/pages/Coordination/Reviews/Show.vue',
            'component' => 'ReviewObservationSheet',
            'component_file' => 'resources/js/components/domain/syllabus/ReviewObservationSheet.vue',
            'action' => 'ReviewController.storeObservation.form',
        ],
    ];

    foreach ($surfaces as $label => $surface) {
        $page = file_get_contents($root.'/'.$surface['page']);
        $component = file_get_contents($root.'/'.$surface['component_file']);
        $actionComponent = file_get_contents(
            $root.'/'.($surface['action_file'] ?? $surface['component_file']),
        );

        expect($page)->toBeString();
        expect($component)->toBeString();
        expect($actionComponent)->toBeString();

        $this->assertStringContainsString(
            '<'.$surface['component'],
            $page,
            $label.' no monta su componente de alta.',
        );
        if (($surface['inline'] ?? false) === true) {
            $this->assertStringNotContainsString('<FormSheet', $component, $label.' volvió a usar un panel lateral.');
        } else {
            $this->assertStringNotContainsString(
                $surface['action'],
                $page,
                $label.' volvió a incrustar el formulario en la página.',
            );
            $this->assertStringContainsString(
                '<FormSheet',
                $component,
                $label.' no usa el Sheet compartido.',
            );
        }
        $this->assertStringContainsString(
            $surface['action'],
            $actionComponent,
            $label.' perdió su acción de servidor.',
        );
        $this->assertStringContainsString(
            $surface['success'] ?? (($surface['inline'] ?? false) === true
                ? '@success="addingBlock = false"'
                : '@success="close"'),
            $actionComponent,
            ($surface['inline'] ?? false) === true
                ? $label.' no cierra la creación directa después del éxito.'
                : $label.' no cierra el panel después del éxito.',
        );
    }
});

it('protege la direccion y accesibilidad del sheet compartido', function (): void {
    $source = file_get_contents(
        dirname(__DIR__, 2).'/resources/js/components/domain/FormSheet.vue',
    );

    expect($source)->toBeString();
    expect($source)
        ->toContain('defineModel<boolean>')
        ->toContain('<SheetContent')
        ->toContain('side="right"')
        ->toContain('<SheetTitle>')
        ->toContain('<SheetDescription>');
});

it('permite elegir la carrera al entrar y cambiar el ambito desde el menu de usuario', function (): void {
    $root = dirname(__DIR__, 2);
    $selection = file_get_contents($root.'/resources/js/pages/Role/Select.vue');
    $navigation = file_get_contents($root.'/resources/js/components/NavUser.vue');
    $menu = file_get_contents($root.'/resources/js/components/UserMenuContent.vue');
    $switcher = file_get_contents(
        $root.'/resources/js/components/domain/identity/WorkScopeSwitcherSheet.vue',
    );

    expect($selection)
        ->toBeString()
        ->toContain('Bienvenida')
        ->toContain('Entrar a esta carrera')
        ->toContain('<Card');
    expect($navigation)
        ->toBeString()
        ->toContain('<WorkScopeSwitcherSheet')
        ->toContain('activeRole?.career_name')
        ->toContain('@switch-scope="switcherOpen = true"');
    expect($menu)
        ->toBeString()
        ->toContain('Cambiar carrera o rol')
        ->toContain('$emit(\'switch-scope\')');
    expect($switcher)
        ->toBeString()
        ->toContain('<SheetTitle>')
        ->toContain('<SheetDescription>')
        ->toContain('ActiveRoleController.store.form()')
        ->toContain('role_assignment_id');
});

it('presenta la jerarquia academica en submenus y rutas sin mezclar catalogos', function (): void {
    $root = dirname(__DIR__, 2);
    $source = file_get_contents(
        $root.'/resources/js/components/domain/academic/CatalogSection.vue',
    );
    $sidebar = file_get_contents($root.'/resources/js/components/AppSidebar.vue');
    $navigation = file_get_contents($root.'/resources/js/components/NavMain.vue');

    expect($source)->toBeString();
    expect($source)
        ->toContain('career.faculty_id === facultyId')
        ->toContain('facultyName(career.faculty_id)')
        ->toContain("section === 'faculties'")
        ->toContain("section === 'careers'")
        ->toContain("section === 'campuses'")
        ->toContain("section === 'modalities'")
        ->not->toContain('<Tabs');
    expect($sidebar)
        ->toBeString()
        ->toContain("title: 'Estructura académica'")
        ->toContain("academicIndex('facultades')")
        ->toContain("academicIndex('carreras')")
        ->toContain("academicIndex('campus')")
        ->toContain("academicIndex('modalidades')")
        ->toContain("academicIndex('periodos-academicos')");
    expect($navigation)
        ->toBeString()
        ->toContain('<SidebarMenuSub')
        ->toContain('<SidebarMenuSubButton');
});

it('presenta una sola malla por carrera sin buscador filtros cards ni versiones', function (): void {
    $root = dirname(__DIR__, 2);
    $sidebar = file_get_contents($root.'/resources/js/components/AppSidebar.vue');
    $curricula = file_get_contents(
        $root.'/resources/js/pages/Coordination/Academic/Curricula.vue',
    );
    $curriculumActions = file_get_contents(
        $root.'/resources/js/components/domain/academic/CurriculumActions.vue',
    );
    $curriculumBuilder = file_get_contents(
        $root.'/resources/js/pages/Coordination/Academic/CurriculumBuilder.vue',
    );
    $curriculumForm = file_get_contents(
        $root.'/resources/js/components/domain/academic/curriculum/CurriculumFormView.vue',
    );
    $offerings = file_get_contents(
        $root.'/resources/js/pages/Coordination/Academic/Offerings.vue',
    );
    $parallels = file_get_contents(
        $root.'/resources/js/pages/Coordination/Academic/Parallels.vue',
    );

    expect($sidebar)
        ->toBeString()
        ->toContain("title: 'Malla'")
        ->toContain('href: curriculaIndex()')
        ->not->toContain("title: 'Mallas y materias'")
        ->not->toContain('subjectsIndex')
        ->toContain("title: 'Ofertas y paralelos'")
        ->toContain("title: 'Ofertas'")
        ->toContain('href: offeringsIndex()')
        ->toContain("title: 'Paralelos'")
        ->toContain('href: parallelsIndex()');
    expect($curricula)
        ->toBeString()
        ->toContain('entity="malla"')
        ->toContain('<Head title="Malla"')
        ->toContain('<Empty')
        ->toContain('<Inbox')
        ->toContain('No hay una malla configurada')
        ->not->toContain('ClientFilterBar')
        ->not->toContain('TablePagination')
        ->not->toContain('CurriculaTab')
        ->not->toContain('version_number');
    expect($curriculumActions)
        ->toBeString()
        ->toContain('entity="malla"')
        ->toContain('destroyCurriculum.form')
        ->toContain('<TableActionsMenu')
        ->toContain('display="menu"')
        ->toContain('@select="deleteOpen = true"')
        ->toContain('@select="emit(\'configure\')"')
        ->toContain('Eliminar')
        ->toContain('Configurar')
        ->toContain('<Dialog')
        ->not->toContain('Editar')
        ->not->toContain('CareerAcademicEditSheet')
        ->not->toContain('<DialogTrigger');
    expect($curriculumBuilder.$curriculumForm)
        ->toBeString()
        ->not->toContain('Malla publicada')
        ->not->toContain('número de versión')
        ->not->toContain('version_number');
    expect($offerings)->toBeString()->toContain('entity="oferta"');
    expect($parallels)->toBeString()->toContain('entity="paralelo"');
});

it('ofrece desglose y constructor visual sobre el mismo contrato de malla', function (): void {
    $root = dirname(__DIR__, 2);
    $page = file_get_contents(
        $root.'/resources/js/pages/Coordination/Academic/CurriculumBuilder.vue',
    );
    $canvas = file_get_contents(
        $root.'/resources/js/components/domain/academic/curriculum/CurriculumCanvas.vue',
    );
    $form = file_get_contents(
        $root.'/resources/js/components/domain/academic/curriculum/CurriculumFormView.vue',
    );
    $visualForm = file_get_contents(
        $root.'/resources/js/components/domain/academic/curriculum/CurriculumVisualSubjectForm.vue',
    );
    $subjectSheet = file_get_contents(
        $root.'/resources/js/components/domain/academic/curriculum/CurriculumSubjectSheet.vue',
    );
    $requirementSheet = file_get_contents(
        $root.'/resources/js/components/domain/academic/curriculum/CurriculumRequirementSheet.vue',
    );
    $subjectField = file_get_contents(
        $root.'/resources/js/components/domain/academic/curriculum/CurriculumSubjectFieldInput.vue',
    );
    $subjectNode = file_get_contents(
        $root.'/resources/js/components/domain/academic/curriculum/CurriculumSubjectNode.vue',
    );
    $addSubjectNode = file_get_contents(
        $root.'/resources/js/components/domain/academic/curriculum/CurriculumAddSubjectNode.vue',
    );
    $configuration = file_get_contents(
        $root.'/resources/js/components/domain/academic/curriculum/CurriculumConfigurationSheet.vue',
    );

    expect($page)
        ->toBeString()
        ->toContain('<Head title="Malla"')
        ->toContain('<CurriculumActions')
        ->toContain('@configure="configurationOpen = true"')
        ->toContain('<CurriculumCanvas')
        ->toContain('<CurriculumFormView')
        ->toContain('organizationUnits')
        ->toContain('<TabsList')
        ->toContain('v-model="activeMode"')
        ->toContain("activeMode === 'breakdown'")
        ->toContain('<TabsTrigger value="breakdown"')
        ->toContain('<TabsTrigger value="builder"')
        ->toContain(':field-definitions="fieldDefinitions"');
    expect($canvas)
        ->toBeString()
        ->toContain("from '@vue-flow/core'")
        ->toContain('useVueFlow({ id: flowId })')
        ->toContain('setNodes(nextNodes)')
        ->toContain('updateSubjectLayout.url')
        ->toContain('storeSubjectRequirement.url')
        ->toContain('CurriculumAddSubjectNode')
        ->toContain('draftCycle')
        ->toContain('#node-addSubject')
        ->toContain('@node-click="onNodeClick"')
        ->toContain('@add="beginSubjectCreation"')
        ->not->toContain('onAdd: beginSubjectCreation')
        ->not->toContain("toast.success('Materia reubicada.')")
        ->not->toContain('position.x:')
        ->not->toContain('position.y:');
    // El alta de relaciones vive en un Sheet, como el alta de materias (pedido del
    // usuario, 2026-09-02); el desglose conserva la tabla y la eliminación.
    expect($requirementSheet)
        ->toBeString()
        ->toContain('<FormSheet')
        ->toContain('storeSubjectRequirement.form')
        ->toContain('@success="close"');
    expect($form)
        ->toBeString()
        ->not->toContain('storeSubjectRequirement.form')
        ->toContain('destroySubjectRequirement.form')
        ->toContain('@select="emit(\'edit\', subject)"')
        ->toContain('<TableActionsMenu');
    expect($visualForm)
        ->toBeString()
        ->toContain("store.form('asignatura')")
        ->toContain('update.form({')
        ->toContain('<CurriculumSubjectFieldInput')
        ->toContain('<OrganizationUnitInput')
        ->not->toContain('<FormSheet');
    expect($subjectSheet)
        ->toBeString()
        ->toContain('sm:grid-cols-5')
        ->toContain('<OrganizationUnitInput')
        ->toContain('<CurriculumSubjectFieldInput')
        ->not->toContain('name="position"')
        ->not->toContain('Orden dentro del ciclo');
    expect($subjectField)
        ->toBeString()
        ->toContain('required')
        ->toContain("field.system_key === 'total_hours'")
        ->toContain(':readonly="isCalculatedTotal"');
    // Las acciones de la tarjeta viven en el menú de 3 puntos con Editar y
    // Eliminar + Dialog de confirmación (pedido del usuario, 2026-09-01).
    expect($subjectNode)
        ->toBeString()
        ->toContain('<CurriculumVisualSubjectForm')
        ->toContain('<TableActionsMenu')
        ->toContain(':label="`Acciones para ${data.subject.name}`"')
        ->toContain('destroySubject.form');
    expect($addSubjectNode)
        ->toBeString()
        ->toContain('add: [cycle: number]')
        ->toContain('@click="emit(\'add\', data.cycle)"')
        ->not->toContain('data.onAdd');
    expect($configuration)
        ->toBeString()
        ->toContain('<FormSheet')
        ->toContain('full-screen');
});

it('evita repetir el encabezado de pagina dentro de las tablas academicas', function (): void {
    $root = dirname(__DIR__, 2);
    $offerings = file_get_contents(
        $root.'/resources/js/components/domain/academic/OfferingsTab.vue',
    );

    expect($offerings)
        ->toBeString()
        ->not->toContain('<CardHeader')
        ->not->toContain('<CardTitle')
        ->not->toContain('<CardDescription');
});

it('agrupa procesos y registro de actividad bajo auditoria', function (): void {
    $sidebar = file_get_contents(
        dirname(__DIR__, 2).'/resources/js/components/AppSidebar.vue',
    );

    expect($sidebar)
        ->toBeString()
        ->toContain("title: 'Auditoría'")
        ->toContain("title: 'Procesos'")
        ->toContain('href: jobsIndex()')
        ->toContain("title: 'Registro de actividad'")
        ->toContain('href: auditIndex()');
});

it('no muestra la regla de agrupacion como aviso en convocatorias', function (): void {
    $page = file_get_contents(
        dirname(__DIR__, 2).'/resources/js/pages/Coordination/Convocations/Index.vue',
    );

    expect($page)
        ->toBeString()
        ->not->toContain('Un sílabo por paralelo')
        ->not->toContain('Cada paralelo genera su propio sílabo')
        ->not->toContain('PV-06')
        ->not->toContain('<Alert>');
});

it('ofrece edicion y ciclo de vida en cada catalogo institucional', function (): void {
    $root = dirname(__DIR__, 2);
    $catalogs = file_get_contents(
        $root.'/resources/js/components/domain/academic/CatalogSection.vue',
    );
    $actions = file_get_contents(
        $root.'/resources/js/components/domain/academic/CatalogActions.vue',
    );
    $editSheet = file_get_contents(
        $root.'/resources/js/components/domain/academic/CatalogEditSheet.vue',
    );
    $status = file_get_contents(
        $root.'/resources/js/components/domain/academic/RecordStatusForm.vue',
    );

    expect($catalogs)
        ->toBeString()
        ->toContain('<CatalogActions')
        ->toContain('entity="facultad"')
        ->toContain('entity="carrera"')
        ->toContain('entity="campus"')
        ->toContain('entity="modalidad"')
        ->toContain('entity="periodo"');
    expect($actions)
        ->toBeString()
        ->toContain('<CatalogEditSheet')
        ->toContain('<RecordStatusForm');
    expect($editSheet)
        ->toBeString()
        ->toContain('<FormSheet')
        ->toContain('AcademicGovernanceController.update.form')
        ->toContain('@success="close"')
        ->toContain('Guardar cambios');
    expect($status)
        ->toBeString()
        ->toContain("active ? 'Archivar' : 'Reactivar'");
});

it('agrupa las acciones de tabla en menus accesibles de tres puntos', function (): void {
    $root = dirname(__DIR__, 2);
    $menu = file_get_contents(
        $root.'/resources/js/components/domain/TableActionsMenu.vue',
    );

    expect($menu)
        ->toBeString()
        ->toContain('<DropdownMenuTrigger as-child>')
        ->toContain('<DropdownMenuGroup>')
        ->toContain('<MoreHorizontal')
        ->toContain('data-slot="table-actions"')
        ->toContain('size="icon-sm"')
        ->toContain(':aria-label="label"');

    $surfaces = [
        'resources/js/components/domain/academic/CatalogActions.vue' => 1,
        'resources/js/components/domain/academic/CareerAcademicActions.vue' => 1,
        'resources/js/components/domain/academic/CoordinatorAssignmentsPanel.vue' => 1,
        'resources/js/pages/Admin/Operations/Jobs.vue' => 1,
        'resources/js/pages/Admin/Users/Index.vue' => 1,
        'resources/js/pages/Coordination/Reports/Index.vue' => 1,
        'resources/js/pages/Coordination/Reviews/Index.vue' => 1,
        'resources/js/pages/Syllabi/Documents.vue' => 1,
        'resources/js/components/domain/academic/curriculum/CurriculumFormView.vue' => 2,
    ];
    $checked = 0;

    foreach ($surfaces as $surface => $expected) {
        $source = file_get_contents($root.'/'.$surface);
        $this->assertIsString($source);
        $this->assertSame(
            $expected,
            substr_count($source, '<TableActionsMenu'),
            $surface.' no usa el menú compartido en todas sus acciones.',
        );
        $checked += $expected;
    }

    $catalogs = file_get_contents(
        $root.'/resources/js/components/domain/academic/CatalogSection.vue',
    );
    $this->assertIsString($catalogs);
    $this->assertSame(5, substr_count($catalogs, '<CatalogActions'));

    foreach ([
        'resources/js/components/domain/academic/OfferingsTab.vue' => 2,
        'resources/js/components/domain/academic/TeacherAssignmentsPanel.vue' => 1,
    ] as $surface => $expected) {
        $source = file_get_contents($root.'/'.$surface);
        $this->assertIsString($source);
        $this->assertSame(
            $expected,
            substr_count($source, '<CareerAcademicActions'),
            $surface.' no usa las acciones académicas compartidas en todas sus filas.',
        );
        $checked += $expected;
    }

    $this->assertSame(13, $checked);

    $vueFiles = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root.'/resources/js'),
    );
    $checkedColumns = 0;

    foreach ($vueFiles as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $source = file_get_contents($file->getPathname());
        $this->assertIsString($source);
        preg_match_all(
            '/<Table(?:\s[^>]*)?>(.*?)<\/Table>/s',
            $source,
            $tables,
        );

        foreach ($tables[0] as $table) {
            $actionColumns = preg_match_all(
                '/<TableHead\b[^>]*>\s*Acciones\s*<\/TableHead>/s',
                $table,
            );

            if ($actionColumns === 0) {
                continue;
            }

            $sharedMenus = substr_count($table, '<TableActionsMenu')
                + substr_count($table, '<CareerAcademicActions')
                + substr_count($table, '<CatalogActions')
                + substr_count($table, '<SyllabusProcessActions')
                + substr_count($table, '<ConvocationActions')
                + substr_count($table, '<AcademicSourceActions');
            $relativePath = str_replace($root.'/', '', $file->getPathname());

            $this->assertSame(
                $actionColumns,
                $sharedMenus,
                $relativePath.' tiene una columna Acciones sin el menú compartido de tres puntos.',
            );
            $checkedColumns += $actionColumns;
        }
    }

    $this->assertGreaterThan(0, $checkedColumns);
});

it('edita cuentas desde una sola accion del listado de usuarios', function (): void {
    $source = file_get_contents(
        dirname(__DIR__, 2).'/resources/js/pages/Admin/Users/Index.vue',
    );
    $editSheet = file_get_contents(
        dirname(__DIR__, 2).'/resources/js/components/domain/identity/ManagedUserEditSheet.vue',
    );

    // Una sola opción «Editar» reúne identidad, estado y asignación de rol; el menú de
    // la fila no vuelve a repartirlas en acciones separadas.
    expect($source)
        ->toBeString()
        ->toContain('<ManagedUserEditSheet')
        ->toContain('display="menu"')
        ->not->toContain('<UserProfileSheet')
        ->not->toContain('<RoleAssignmentSheet')
        ->not->toContain('setStatus.form')
        ->not->toContain('ManagedUserController.show(user.id)');
    // Consultar y corregir son acciones distintas: «Ver» abre una ficha de solo lectura
    // y no vuelve a montar un formulario dentro del menú.
    $detailSheet = file_get_contents(
        dirname(__DIR__, 2).'/resources/js/components/domain/identity/ManagedUserDetailSheet.vue',
    );

    expect($source)->toContain('<ManagedUserDetailSheet');
    expect($detailSheet)
        ->toBeString()
        ->toContain('<DropdownMenuItem')
        ->toContain('Roles archivados')
        ->not->toContain('<Form')
        ->not->toContain('<FormSheetActions');
    expect($editSheet)
        ->toBeString()
        ->toContain("display?: 'button' | 'menu'")
        ->toContain('ManagedUserController.update.form')
        ->toContain('@success="close"')
        ->toContain('Cuenta activa')
        ->toContain('Asignar otro rol')
        ->toContain('Guardar cambios')
        ->toContain("display === 'menu'");
});

it('arma la plantilla sobre la hoja impresa, sin formularios por tarjeta', function (): void {
    $root = dirname(__DIR__, 2);
    $source = file_get_contents($root.'/resources/js/pages/Admin/Templates/Show.vue');

    // I-32: sin versiones ni publicación. I-33: una sola superficie, la hoja.
    expect($source)
        ->toBeString()
        ->not->toContain('Publicar')
        ->not->toContain('TemplateController.publish')
        ->not->toContain('TemplateController.clone')
        ->not->toContain('Vista previa')
        ->not->toContain('<Card')
        ->toContain('size="wide"')
        ->toContain('<TemplateSheetEditor')
        ->toContain(':readonly="processLock !== null"');

    $editor = file_get_contents(
        $root.'/resources/js/components/domain/configuration/TemplateSheetEditor.vue',
    );

    expect($editor)
        ->toBeString()
        // Paleta: cinco piezas, arrastrables y con clic.
        ->toContain('Bloque')
        ->toContain("label: 'Texto'")
        ->toContain("label: 'Tabla'")
        ->toContain("label: 'Lista con viñetas'")
        ->toContain("label: 'Lista numerada'")
        ->toContain('draggable="true"')
        ->toContain('addFromPalette')
        // Zonas de soltado y reordenamiento por arrastre.
        ->toContain('doc-zone')
        ->toContain('dropOnSectionZone')
        ->toContain('dropOnFieldZone')
        ->toContain('persistSectionOrder')
        ->toContain('persistFieldOrder')
        ->toContain('copySections')
        // Renombrar con un clic; Enter guarda, Escape cancela.
        ->toContain('startRename')
        ->toContain('@keydown.enter.prevent="commitRename"')
        ->toContain('@keydown.esc.prevent="cancelRename"')
        // Menú del campo: tipo, propiedades y eliminar. Sin botones «Guardar».
        ->toContain('Tipo de contenido')
        ->toContain('Propiedades')
        ->toContain('Eliminar campo')
        ->toContain('Eliminar bloque')
        ->toContain('<TemplateFieldSheet')
        ->toContain('preserveScroll: true')
        ->not->toContain('Guardar bloque')
        ->not->toContain('Guardar campo')
        ->not->toContain('<Form')
        ->not->toContain('Clave estable')
        ->not->toContain('structuredClone')
        // La hoja: estándar del impreso y relleno por tipo de contenido.
        ->toContain('PROGRAMA DE ASIGNATURA (SÍLABO)')
        ->toContain('font-family: Arial')
        ->toContain("'table'")
        ->toContain("'bulleted_list'")
        ->toContain("'numbered_list'")
        ->toContain('Lorem ipsum');

    $properties = file_get_contents(
        $root.'/resources/js/components/domain/configuration/TemplateFieldSheet.vue',
    );

    expect($properties)
        ->toBeString()
        ->toContain('Propiedades del campo')
        ->toContain(':show-trigger="false"')
        ->toContain('defineExpose({ edit })')
        ->toContain('name="content_type"')
        ->not->toContain('Código de referencia');
});

it('abre los detalles de los listados desde sus acciones', function (): void {
    $root = dirname(__DIR__, 2);
    $surfaces = [
        // Las acciones de la fila viven en su menú compartido (I-32).
        'resources/js/components/domain/syllabus/ConvocationActions.vue' => [
            ['Ver seguimiento', 'convocatoria'],
            'ConvocationController.show',
        ],
        'resources/js/pages/Teacher/Syllabi/Index.vue' => [
            ['Abrir', 'sílabo'],
            'SyllabusController.show',
        ],
    ];

    foreach ($surfaces as $surface => [$labels, $route]) {
        $source = file_get_contents($root.'/'.$surface);

        expect($source)
            ->toBeString()
            ->toContain('<TableActionsMenu')
            ->toContain('<DropdownMenuItem')
            ->toContain($route)
            ->not->toContain('variant="link"');

        foreach ($labels as $label) {
            expect($source)->toContain($label);
        }
    }
});

it('presenta las plantillas como cards y navega versiones desde el detalle', function (): void {
    $root = dirname(__DIR__, 2);

    // Una sola plantilla (I-32): la ruta abre directo su constructor y el listado solo
    // es el estado vacío con la acción de crear, como la malla de una carrera.
    $index = file_get_contents($root.'/resources/js/pages/Admin/Templates/Index.vue');
    expect($index)
        ->toBeString()
        ->toContain('<Empty')
        ->toContain('<Inbox')
        ->toContain('<TemplateCreationSheet')
        ->not->toContain('ClientFilterBar')
        ->not->toContain('TablePagination')
        ->not->toContain('<CardTitle')
        ->not->toContain('<TableActionsMenu');

    // Una sola plantilla: el detalle no navega versiones (I-32).
    $show = file_get_contents($root.'/resources/js/pages/Admin/Templates/Show.vue');
    expect($show)
        ->toBeString()
        ->not->toContain('Versiones')
        ->not->toContain('sibling.id')
        ->toContain(':template-id="template.id"');

});

it('usa el mismo paginador en todas las superficies tabulares', function (): void {
    $root = dirname(__DIR__, 2);
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root.'/resources/js'),
    );
    $checked = 0;

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $source = file_get_contents($file->getPathname());
        if (! is_string($source)) {
            continue;
        }

        preg_match_all('/<Table(?:\s|>)/', $source, $tables);
        $tableCount = count($tables[0]);
        if ($tableCount === 0) {
            continue;
        }

        $relativePath = str_replace($root.'/', '', $file->getPathname());
        $this->assertSame(
            $tableCount,
            substr_count($source, '<TablePagination'),
            $relativePath.' no pagina todas sus tablas con el patrón compartido.',
        );
        $checked += $tableCount;
    }

    $this->assertSame(24, $checked);
});

it('ordena busqueda filtros y accion mediante una barra compartida', function (): void {
    $root = dirname(__DIR__, 2);
    $pages = [
        'resources/js/pages/Admin/Operations/Audit.vue',
        'resources/js/pages/Admin/Operations/Jobs.vue',
        'resources/js/pages/Admin/Users/Index.vue',
        'resources/js/pages/Coordination/Reports/Index.vue',
        'resources/js/pages/Coordination/Reviews/Index.vue',
    ];

    foreach ($pages as $page) {
        $source = file_get_contents($root.'/'.$page);
        expect($source)->toBeString()->toContain('<FilterToolbar');

        $searchPosition = strpos($source, '#search');
        $filterPosition = strpos($source, '#filters');
        $this->assertIsInt($searchPosition, $page.' no declara búsqueda.');
        $this->assertIsInt($filterPosition, $page.' no declara filtros.');
        $this->assertLessThan(
            $filterPosition,
            $searchPosition,
            $page.' no presenta la búsqueda antes de los filtros.',
        );
    }

    $toolbar = file_get_contents(
        $root.'/resources/js/components/domain/FilterToolbar.vue',
    );
    expect($toolbar)
        ->toBeString()
        ->toContain('<slot name="search"')
        ->toContain('<slot name="filters"')
        // La consulta sale sola al escribir, con espera, y en el acto al elegir un
        // filtro. Si alguien devuelve el botón de aplicar, esta regla lo delata.
        ->toContain('setTimeout')
        ->toContain('requestSubmit')
        // Queda un envío accesible aunque no se vea: sin él, Intro deja de funcionar
        // en un formulario con varios campos.
        ->toContain('type="submit"')
        ->toContain('sr-only')
        ->not->toContain('Aplicar filtros')
        // En móvil los filtros se agrupan tras un botón; la búsqueda se queda fuera.
        ->toContain('MobileFilterSheet');

    $sheet = file_get_contents(
        dirname(__DIR__, 2).'/resources/js/components/domain/MobileFilterSheet.vue',
    );
    expect($sheet)
        ->toBeString()
        // El panel de la librería lleva su contenido al `body` con un portal, y unos
        // campos fuera del formulario dejarían de enviarse.
        ->not->toContain('SheetContent')
        ->not->toContain('DialogPortal')
        ->toContain('max-sm:fixed');
});

it('diferencia el fondo de las superficies en claro y oscuro', function (): void {
    $root = dirname(__DIR__, 2);
    $theme = file_get_contents($root.'/resources/css/app.css');
    $sheet = file_get_contents(
        $root.'/resources/js/components/ui/sheet/SheetContent.vue',
    );

    // La tarjeta se apoya sobre el fondo, así que debe ser más clara que él en ambos
    // temas. Se comprueba la relación y no los valores, que se reajustan.
    foreach ([':root', '.dark'] as $tema) {
        preg_match('/'.preg_quote($tema, '/').' \{(.*?)\n\}/s', (string) $theme, $bloque);
        preg_match('/--background: hsl\(0 0% ([\d.]+)%\)/', $bloque[1], $fondo);
        preg_match('/--card: hsl\(0 0% ([\d.]+)%\)/', $bloque[1], $tarjeta);

        expect((float) $tarjeta[1])->toBeGreaterThan(
            (float) $fondo[1],
            "En {$tema} la tarjeta no es más clara que el fondo.",
        );
    }
    expect($sheet)
        ->toBeString()
        ->toContain('bg-card text-card-foreground');
});

it('normaliza los encabezados de todos los modulos autenticados', function (): void {
    $root = dirname(__DIR__, 2);
    $pages = [
        'resources/js/pages/Admin/Academic/Index.vue',
        'resources/js/pages/Admin/Operations/Audit.vue',
        'resources/js/pages/Admin/Operations/Jobs.vue',
        'resources/js/pages/Admin/Processes/Index.vue',
        'resources/js/pages/Admin/Templates/Index.vue',
        'resources/js/pages/Admin/Templates/Show.vue',
        'resources/js/pages/Admin/Users/Index.vue',
        'resources/js/pages/Admin/Users/Show.vue',
        'resources/js/pages/Role/Select.vue',
        'resources/js/pages/Coordination/Academic/Curricula.vue',
        'resources/js/pages/Coordination/Academic/CurriculumBuilder.vue',
        'resources/js/pages/Coordination/Academic/Offerings.vue',
        'resources/js/pages/Coordination/Academic/Parallels.vue',
        'resources/js/pages/Coordination/Academic/TeacherAssignments.vue',
        'resources/js/pages/Coordination/Convocations/Index.vue',
        'resources/js/pages/Coordination/Convocations/Show.vue',
        'resources/js/pages/Coordination/Reports/Index.vue',
        'resources/js/pages/Coordination/Reviews/Index.vue',
        'resources/js/pages/Coordination/Reviews/Show.vue',
        'resources/js/pages/Dashboard.vue',
        'resources/js/pages/Notifications/Index.vue',
        'resources/js/pages/Sources/Index.vue',
        'resources/js/pages/Sources/Show.vue',
        'resources/js/pages/Syllabi/Compare.vue',
        'resources/js/pages/Syllabi/Documents.vue',
        'resources/js/pages/Teacher/Syllabi/Ai.vue',
        'resources/js/pages/Teacher/Syllabi/Edit.vue',
        'resources/js/pages/Teacher/Syllabi/Index.vue',
        'resources/js/pages/Teacher/Syllabi/Show.vue',
        'resources/js/pages/Teacher/Syllabi/Submit.vue',
        'resources/js/layouts/settings/Layout.vue',
    ];

    foreach ($pages as $page) {
        $source = file_get_contents($root.'/'.$page);
        $this->assertIsString($source);
        $this->assertSame(
            1,
            substr_count($source, '<PageFrame'),
            $page.' no monta exactamente un encabezado compartido.',
        );
        // Sin icono de modulo: el nombre de la pantalla ya esta en el encabezado y el
        // dibujo repetia lo que decia la frase de debajo.
        $this->assertDoesNotMatchRegularExpression(
            '/<PageFrame\b[^>]*:icon=/s',
            $source,
            $page.' vuelve a declarar un icono de modulo.',
        );
        $this->assertMatchesRegularExpression(
            '/<PageFrame\b[^>]*(?::)?title=/s',
            $source,
            $page.' no declara el título del módulo.',
        );
        $this->assertMatchesRegularExpression(
            '/<PageFrame\b[^>]*(?::)?description=/s',
            $source,
            $page.' no declara la descripción del módulo.',
        );
        $this->assertStringNotContainsString('<header', $source);
        $this->assertStringNotContainsString('<h1', $source);
    }

    $frame = file_get_contents(
        $root.'/resources/js/components/domain/PageFrame.vue',
    );
    expect($frame)
        ->toBeString()
        ->toContain("size?: 'full' | 'wide' | 'narrow'")
        ->toContain('gap-6 overflow-x-hidden p-4 sm:p-6')
        // Sin icono: el nombre de la pantalla ya esta arriba y el dibujo no anadia nada
        // que no dijera la propia frase.
        ->not->toContain('<component :is="icon"')
        // El nombre de la pantalla vive en el encabezado, no aqui.
        ->toContain('usePageTitle')
        ->toContain('<slot name="eyebrow"')
        ->toContain('<slot name="meta"')
        ->toContain('<slot name="actions"');

    $declaredPages = array_values(array_filter(
        $pages,
        fn (string $page): bool => str_starts_with(
            $page,
            'resources/js/pages/',
        ),
    ));
    $discoveredPages = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root.'/resources/js/pages'),
    );

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $relativePath = str_replace($root.'/', '', $file->getPathname());
        if (
            $relativePath === 'resources/js/pages/Welcome.vue'
            || str_starts_with($relativePath, 'resources/js/pages/auth/')
            || str_starts_with($relativePath, 'resources/js/pages/settings/')
        ) {
            continue;
        }

        $discoveredPages[] = $relativePath;
    }

    sort($declaredPages);
    sort($discoveredPages);
    $this->assertSame(
        $discoveredPages,
        $declaredPages,
        'El inventario de módulos autenticados cambió sin aplicar PageFrame.',
    );

    foreach ([
        'resources/js/pages/settings/Appearance.vue',
        'resources/js/pages/settings/Profile.vue',
        'resources/js/pages/settings/Security.vue',
    ] as $settingsPage) {
        $source = file_get_contents($root.'/'.$settingsPage);
        $this->assertIsString($source);
        $this->assertStringNotContainsString(
            '<h1',
            $source,
            $settingsPage.' duplica el título principal de Configuración.',
        );
    }

    $this->assertCount(30, $declaredPages);
    $this->assertCount(31, $pages);
});

it('mantiene explicitamente clasificadas las mutaciones store que permanecen en paginas completas', function (): void {
    $root = dirname(__DIR__, 2);
    $pagesRoot = $root.'/resources/js/pages';
    $bindings = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($pagesRoot),
    );

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $source = file_get_contents($file->getPathname());
        if (! is_string($source)) {
            continue;
        }

        preg_match_all(
            '/[A-Z][A-Za-z]+Controller\.(?:store(?:Field|Observation)?|addFragment|assignRole)\.form\(/',
            $source,
            $matches,
        );

        foreach ($matches[0] as $binding) {
            $relativePath = str_replace($root.'/', '', $file->getPathname());
            $bindings[] = $relativePath.':'.rtrim($binding, '(');
        }
    }

    sort($bindings);

    expect($bindings)->toBe([
        'resources/js/pages/Role/Select.vue:ActiveRoleController.store.form',
        'resources/js/pages/Teacher/Syllabi/Ai.vue:AiAssistanceController.store.form',
    ]);
});

it('ofrece quitar los filtros en las dos barras y solo cuando hay alguno puesto', function (): void {
    $root = dirname(__DIR__, 2);

    foreach ([
        'resources/js/components/domain/FilterToolbar.vue',
        'resources/js/components/domain/ClientFilterBar.vue',
    ] as $bar) {
        $source = file_get_contents($root.'/'.$bar);
        $this->assertIsString($source);

        // Dentro del panel: en pantalla estrecha el boton acompana a los filtros que
        // deshace, no a la busqueda, que se queda fuera.
        $this->assertStringContainsString('Quitar filtros', $source, $bar);
        $this->assertStringContainsString('FilterX', $source, $bar);
        $this->assertMatchesRegularExpression(
            '/v-if="(active|filter\.active\.value)"/',
            $source,
            $bar.' muestra el boton aunque no haya filtros puestos.',
        );
    }

    // La barra de servidor lee la direccion, que es donde viven sus filtros, y rehace la
    // pantalla al limpiar: conservando el estado los campos seguirian mostrando lo que ya
    // no se aplica.
    $toolbar = file_get_contents($root.'/resources/js/components/domain/FilterToolbar.vue');
    $this->assertIsString($toolbar);
    $this->assertStringContainsString('preserveState: false', $toolbar);
    $this->assertStringContainsString('new FormData(form)', $toolbar);
    $this->assertStringContainsString('syncActive(event.target)', $toolbar);
    $this->assertStringContainsString('draftActive.value ?? urlActive.value', $toolbar);
    $this->assertStringContainsString('draftActive.value = false', $toolbar);
});
