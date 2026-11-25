import forge from 'node-forge';

export type SignatureErrorCode =
  | 'invalid_file'
  | 'wrong_password'
  | 'no_key'
  | 'expired'
  | 'not_yet_valid';

const messages: Record<SignatureErrorCode, string> = {
  invalid_file: 'El archivo no es un certificado de firma .p12 o .pfx válido',
  wrong_password: 'La clave del certificado es incorrecta',
  no_key: 'El certificado no contiene la llave para firmar. Use el archivo .p12 que le entregó la entidad emisora',
  expired: 'El certificado de firma está vencido. Renueve su firma electrónica',
  not_yet_valid: 'El certificado de firma todavía no es válido',
};

export class SignatureError extends Error {
  constructor(readonly code: SignatureErrorCode, message = messages[code]) {
    super(message);
    this.name = 'SignatureError';
  }
}

export type SignerCertificate = {
  holder: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
};

const toBinary = (bytes: Uint8Array): string => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return binary;
};

// forge entrega los UTF8String como bytes: «MARÃ\u008dA» en vez de «MARÍA».
const attribute = (subject: forge.pki.Certificate['subject'], name: string): string => {
  const field = subject.getField(name) as { value?: unknown; valueTagClass?: number } | null;
  const value = String(field?.value ?? '');
  if (field?.valueTagClass !== forge.asn1.Type.UTF8) return value.trim();
  try {
    return forge.util.decodeUtf8(value).trim();
  } catch {
    return value.trim();
  }
};

export type SignerMaterial = {
  certificate: SignerCertificate;
  key: forge.pki.rsa.PrivateKey;
  x509: forge.pki.Certificate;
  chain: forge.pki.Certificate[];
};

export function readCertificate(p12: Uint8Array, password: string, now: Date = new Date()): SignerCertificate {
  return readSigner(p12, password, now).certificate;
}

export function readSigner(p12: Uint8Array, password: string, now: Date = new Date()): SignerMaterial {
  let asn1: forge.asn1.Asn1;
  try {
    asn1 = forge.asn1.fromDer(forge.util.createBuffer(toBinary(p12)), false);
  } catch {
    throw new SignatureError('invalid_file');
  }
  let store: forge.pkcs12.Pkcs12Pfx;
  try {
    store = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (reason) {
    const text = reason instanceof Error ? reason.message : String(reason);
    throw new SignatureError(/invalid password|mac could not be verified|decrypt/i.test(text) ? 'wrong_password' : 'invalid_file');
  }

  const keys = store.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const key = keys[0]?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!key) throw new SignatureError(keys.length === 0 && password === '' ? 'wrong_password' : 'no_key');
  const certificates = (store.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((bag) => bag.cert)
    .filter((cert): cert is forge.pki.Certificate => Boolean(cert));
  const certificate = certificates
    .find((cert): cert is forge.pki.Certificate => {
      const publicKey = cert?.publicKey as forge.pki.rsa.PublicKey | undefined;
      return Boolean(publicKey?.n && key.n.compareTo(publicKey.n) === 0 && key.e.compareTo(publicKey.e) === 0);
    });
  if (!certificate) throw new SignatureError('no_key');

  const { notBefore, notAfter } = certificate.validity;
  if (notAfter.getTime() < now.getTime()) throw new SignatureError('expired');
  if (notBefore.getTime() > now.getTime()) throw new SignatureError('not_yet_valid');

  const holder = attribute(certificate.subject, 'CN') || attribute(certificate.subject, 'O');
  if (!holder) throw new SignatureError('invalid_file', 'El certificado no identifica a su titular');

  return {
    certificate: {
      holder,
      issuer: attribute(certificate.issuer, 'CN') || attribute(certificate.issuer, 'O'),
      validFrom: notBefore,
      validTo: notAfter,
    },
    key,
    x509: certificate,
    chain: certificates.filter((cert) => cert !== certificate),
  };
}
