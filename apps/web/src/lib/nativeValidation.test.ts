import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installNativeValidation } from '@/lib/nativeValidation';

describe('installNativeValidation', () => {
  let remove: () => void;

  beforeEach(() => {
    remove = installNativeValidation();
    document.body.innerHTML = `
      <form id="form">
        <div><label for="email">Correo</label><input id="email" type="email" required /></div>
        <div class="relative"><input id="clave" type="password" required /><button type="button">ojo</button></div>
      </form>`;
  });

  afterEach(() => {
    remove();
    document.body.innerHTML = '';
  });

  const submit = (): void => {
    document.querySelector<HTMLFormElement>('#form')!.requestSubmit();
  };

  it('un campo vacío no lleva mensaje ni borde rojo, pero se enfoca el primero', async () => {
    submit();
    await Promise.resolve();

    const email = document.querySelector<HTMLInputElement>('#email')!;
    expect(email.hasAttribute('aria-invalid')).toBe(false);
    expect(document.querySelectorAll('[data-slot="field-error"]')).toHaveLength(0);
    expect(document.activeElement).toBe(email);
  });

  it('dice si el correo no tiene formato válido y lo quita al escribir', async () => {
    const email = document.querySelector<HTMLInputElement>('#email')!;
    email.value = 'sin-arroba';
    document.querySelector<HTMLInputElement>('#clave')!.value = 'clave-larga';
    submit();
    await Promise.resolve();

    expect(email.nextElementSibling?.textContent).toBe('Ingrese un correo válido');
    email.value = 'ana@ueb.edu.ec';
    email.dispatchEvent(new Event('input', { bubbles: true }));

    expect(email.hasAttribute('aria-invalid')).toBe(false);
    expect(email.hasAttribute('aria-describedby')).toBe(false);
    expect(email.nextElementSibling).toBeNull();
  });

  it('no repite el mensaje al enviar otra vez', async () => {
    document.querySelector<HTMLInputElement>('#email')!.value = 'sin-arroba';
    document.querySelector<HTMLInputElement>('#clave')!.value = 'clave-larga';
    submit();
    submit();
    await Promise.resolve();

    expect(document.querySelectorAll('[data-slot="field-error"]')).toHaveLength(1);
  });
});
