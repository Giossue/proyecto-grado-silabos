#!/usr/bin/env bash
# Auditoría: usos de elementos nativos del navegador en páginas y componentes de
# dominio donde ya existe un componente shadcn equivalente en resources/js/components/ui.
#
# Uso: bash temp/audit-shadcn.sh
# Excluye components/ui (ahí los elementos nativos son la implementación del propio
# componente) y los inputs ocultos (no tienen equivalente shadcn ni interfaz visible).

set -euo pipefail
cd "$(dirname "$0")/.."

scan() {
    grep -rn --include='*.vue' -E "$1" resources/js | grep -v 'components/ui/' || true
}

report() {
    local title="$1" equivalent="$2" matches="$3"
    local count=0
    [ -n "$matches" ] && count=$(printf '%s\n' "$matches" | wc -l)
    printf '\n== %s → usar %s (%s coincidencias)\n' "$title" "$equivalent" "$count"
    if [ -n "$matches" ]; then
        printf '%s\n' "$matches"
    fi
}

echo "Auditoría de componentes shadcn — $(git rev-parse --short HEAD)"

# Elementos de formulario nativos.
report '<select> nativo' 'ui/select' "$(scan '<select[ >]')"
report 'NativeSelect (estilo de sistema)' 'ui/select' "$(scan '\bNativeSelect\b' | grep -v 'native-select' || true)"
report '<input> nativo (excepto hidden)' 'ui/input | ui/checkbox' "$(scan '<input[ >]' | grep -v 'type="hidden"' || true)"
report '<textarea> nativo' 'ui/textarea' "$(scan '<textarea[ >]')"
report '<button> nativo' 'ui/button' "$(scan '<button[ >]')"
report '<label> nativo' 'ui/field FieldLabel o ui/label' "$(scan '<label[ >]')"
report '<option>/<optgroup> fuera de datalist' 'ui/select SelectItem' "$(scan '<(option|optgroup)[ >]' | grep -v -i 'datalist' || true)"

# Estructuras con equivalente compuesto.
report '<table>/<th>/<td> nativos' 'ui/table' "$(scan '<(table|thead|tbody|th|td|tr)[ >]')"
report '<dialog> nativo' 'ui/dialog' "$(scan '<dialog[ >]')"
report '<details>/<summary> nativos' 'ui/collapsible' "$(scan '<(details|summary)[ >]')"
report '<progress>/<meter> nativos' 'ui/skeleton o barra propia' "$(scan '<(progress|meter)[ >]')"
report '<hr> nativo' 'ui/separator' "$(scan '<hr[ />]')"
report '<img> para avatares' 'ui/avatar (revisar caso por caso)' "$(scan '<img[ >]')"

# Diálogos del sistema operativo / navegador.
report 'confirm()/alert()/prompt() del navegador' 'ui/dialog + ui/sonner' "$(scan '(window\.)?(confirm|alert|prompt)\(')"
