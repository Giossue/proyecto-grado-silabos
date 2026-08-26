// La contraseña temporal la genera el administrador y viaja fuera del sistema hasta
// quien recibe la cuenta, así que debe cumplir la política del servidor
// (12 caracteres, minúscula, mayúscula, dígito y símbolo) sin depender de que alguien
// la componga a mano.
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?-_';

const ALPHABETS = [LOWERCASE, UPPERCASE, DIGITS, SYMBOLS] as const;
const ALL = ALPHABETS.join('');

export const TEMPORARY_PASSWORD_LENGTH = 16;

const randomIndexes = (count: number): Uint32Array => {
    const values = new Uint32Array(count);

    crypto.getRandomValues(values);

    return values;
};

const pick = (alphabet: string, value: number): string =>
    alphabet.charAt(value % alphabet.length);

export function generateTemporaryPassword(
    length = TEMPORARY_PASSWORD_LENGTH,
): string {
    // Una posición por clase obligatoria y el resto libres; después se barajan para que
    // el orden no delate qué carácter cubrió cada requisito.
    const values = randomIndexes(length * 2);
    const characters = ALPHABETS.map((alphabet, index) =>
        pick(alphabet, values[index]),
    );

    for (let index = ALPHABETS.length; index < length; index += 1) {
        characters.push(pick(ALL, values[index]));
    }

    for (let index = characters.length - 1; index > 0; index -= 1) {
        const target = values[length + index] % (index + 1);

        [characters[index], characters[target]] = [
            characters[target],
            characters[index],
        ];
    }

    return characters.join('');
}
