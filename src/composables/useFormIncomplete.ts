import { useEffect, useState, type RefObject } from 'react';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const isControl = (element: Element): element is Control =>
    element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement;

const isEmptyAriaRequired = (element: Control): boolean =>
    element.getAttribute('aria-required') === 'true' && !element.disabled && element.value.trim() === '';

const hasMissingFields = (form: HTMLFormElement): boolean =>
    Array.from(form.elements).some((element) => isControl(element) && ((element.willValidate && !element.validity.valid) || isEmptyAriaRequired(element)));

export function useFormIncomplete(button: RefObject<HTMLElement | null>): boolean {
    const [incomplete, setIncomplete] = useState(false);

    useEffect(() => {
        const element = button.current;
        if (!(element instanceof HTMLButtonElement) || element.type !== 'submit') return;
        const form = element.form;
        if (form === null || form.noValidate) return;
        const update = (): void => setIncomplete(hasMissingFields(form));
        form.addEventListener('input', update, true);
        form.addEventListener('change', update, true);
        const observer = new MutationObserver(update);
        observer.observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ['required', 'aria-required', 'disabled'] });
        update();

        return () => {
            form.removeEventListener('input', update, true);
            form.removeEventListener('change', update, true);
            observer.disconnect();
        };
    }, [button]);

    return incomplete;
}
