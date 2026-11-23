type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const ERROR_ATTR = 'data-native-error';

const isControl = (target: EventTarget | null): target is Control =>
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;

const messageFor = (control: Control): string => {
    const { validity } = control;
    if (validity.valueMissing) return 'Complete este campo';
    if (validity.typeMismatch) return control instanceof HTMLInputElement && control.type === 'email' ? 'Ingrese un correo válido' : 'El formato no es válido';
    if (validity.patternMismatch) return 'El formato no es válido';
    if (validity.tooShort) return `Use al menos ${control.getAttribute('minlength')} caracteres`;
    if (validity.rangeUnderflow) return `El valor mínimo es ${control.getAttribute('min')}`;
    if (validity.rangeOverflow) return `El valor máximo es ${control.getAttribute('max')}`;
    return 'Revise este campo';
};

// El mensaje va debajo del campo; si el campo está envuelto (ojo de contraseña, buscador), debajo del envoltorio.
const anchorOf = (control: Control): Element => {
    const parent = control.parentElement;
    return parent?.matches('.relative, [data-slot="input-group"]') ? parent : control;
};

const clear = (control: Control): void => {
    const id = control.getAttribute(ERROR_ATTR);
    if (id === null) return;
    document.getElementById(id)?.remove();
    control.removeAttribute(ERROR_ATTR);
    control.removeAttribute('aria-invalid');
    const described = (control.getAttribute('aria-describedby') ?? '').split(' ').filter((token) => token !== id && token !== '').join(' ');
    if (described === '') control.removeAttribute('aria-describedby');
    else control.setAttribute('aria-describedby', described);
};

const show = (control: Control): void => {
    clear(control);
    const id = `native-error-${Math.random().toString(36).slice(2, 10)}`;
    const error = document.createElement('div');
    error.id = id;
    error.setAttribute('role', 'alert');
    error.setAttribute('data-slot', 'field-error');
    error.className = 'text-destructive mt-1.5 text-sm font-normal';
    error.textContent = messageFor(control);
    anchorOf(control).insertAdjacentElement('afterend', error);
    control.setAttribute(ERROR_ATTR, id);
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
    const done = (): void => clear(control);
    control.addEventListener('input', done, { once: true });
    control.addEventListener('change', done, { once: true });
};

/**
 * Cambia el globo del navegador («Rellene este campo») por el aviso del sistema: foco en
 * el primer campo con problema y, si el valor está mal (no vacío), borde rojo y mensaje debajo.
 */
export function installNativeValidation(): () => void {
    let first: Control | null = null;
    const onInvalid = (event: Event): void => {
        if (!isControl(event.target)) return;
        event.preventDefault();
        // Un campo vacío no lleva mensaje: el asterisco y el botón deshabilitado ya lo dicen.
        if (!event.target.validity.valueMissing) show(event.target);
        if (first !== null) return;
        first = event.target;
        queueMicrotask(() => {
            first?.focus();
            first = null;
        });
    };
    // `invalid` no sube por el árbol: solo se alcanza en la fase de captura.
    document.addEventListener('invalid', onInvalid, true);
    return () => document.removeEventListener('invalid', onInvalid, true);
}
