import forge from 'node-forge';
import { beforeAll, describe, expect, it } from 'vitest';
import { SignatureError } from '@/lib/signature/certificate';
import { signStatement } from '@/lib/signature/signStatement';
import { makeTestP12 } from '@/lib/signature/testCertificate';

type SignedMessage = forge.pkcs7.PkcsSignedData & {
  rawCapture: { authenticatedAttributes: forge.asn1.Asn1[]; signature: string; content?: forge.asn1.Asn1 };
};

const parse = (cms: string): SignedMessage =>
  forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms), false)) as SignedMessage;

const verifies = (cms: string, statement: string): boolean => {
  const message = parse(cms);
  const attributes = message.rawCapture.authenticatedAttributes;
  const declared = attributes
    .map((attribute) => attribute.value as forge.asn1.Asn1[])
    .find((parts) => forge.asn1.derToOid(parts[0]!.value as string) === forge.pki.oids.messageDigest)!;
  const digest = forge.md.sha256.create().update(forge.util.encodeUtf8(statement)).digest().getBytes();
  const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attributes);
  const signed = forge.md.sha256.create().update(forge.asn1.toDer(set).getBytes()).digest().getBytes();
  const publicKey = message.certificates[0]!.publicKey as forge.pki.rsa.PublicKey;
  return ((declared[1]!.value as forge.asn1.Asn1[])[0]!.value as string) === digest
    && publicKey.verify(signed, message.rawCapture.signature);
};

const statement = `silabos-ueb|silabo:9b2f|accion:envio_docente|huella:${'ab'.repeat(32)}`;

describe('firma de la declaración', () => {
  let p12: Uint8Array;
  beforeAll(() => {
    p12 = makeTestP12('DOCENTE DE PRUEBA ÑANDÚ', 'clave');
  });

  it('firma la declaración en CMS separado con SHA-256 y el certificado del titular', () => {
    const { signature, certificate } = signStatement({ statement, p12, password: 'clave' });

    expect(signature.statement).toBe(statement);
    expect(certificate.holder).toBe('DOCENTE DE PRUEBA ÑANDÚ');
    expect(signature.cms).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const message = parse(signature.cms);
    expect(message.rawCapture.content).toBeUndefined();
    expect(message.certificates).toHaveLength(1);
    expect(verifies(signature.cms, statement)).toBe(true);
  });

  it('la firma no sirve para otra declaración', () => {
    const { signature } = signStatement({ statement, p12, password: 'clave' });

    expect(verifies(signature.cms, statement.replace('envio_docente', 'aprobacion_biblioteca'))).toBe(false);
  });

  it('identifica al firmante con el emisor tal como viene en el certificado, aunque tenga tildes', () => {
    const { signature } = signStatement({ statement, p12, password: 'clave' });

    const signedData = (forge.asn1.fromDer(forge.util.decode64(signature.cms), false).value as forge.asn1.Asn1[])[1]!.value[0] as forge.asn1.Asn1;
    const parts = signedData.value as forge.asn1.Asn1[];
    const certificate = (parts.find((part) => part.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC)!.value as forge.asn1.Asn1[])[0]!;
    const tbs = (certificate.value as forge.asn1.Asn1[])[0]!.value as forge.asn1.Asn1[];
    const certificateIssuer = tbs[tbs[0]!.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC ? 3 : 2]!;
    const signerInfo = ((parts.at(-1)!.value as forge.asn1.Asn1[])[0]!.value as forge.asn1.Asn1[]);
    const signerIssuer = (signerInfo[1]!.value as forge.asn1.Asn1[])[0]!;

    expect(forge.asn1.toDer(signerIssuer).toHex()).toBe(forge.asn1.toDer(certificateIssuer).toHex());
  });

  it('explica la clave incorrecta, el archivo inválido y el certificado vencido', () => {
    expect(() => signStatement({ statement, p12, password: 'otra' })).toThrowError(new SignatureError('wrong_password'));
    expect(() => signStatement({ statement, p12: new Uint8Array([1, 2, 3]), password: 'x' })).toThrowError(new SignatureError('invalid_file'));
    const expired = makeTestP12('VENCIDO', 'x', { from: new Date('2020-01-01'), to: new Date('2021-01-01') });
    expect(() => signStatement({ statement, p12: expired, password: 'x' })).toThrowError(new SignatureError('expired'));
  });
});
