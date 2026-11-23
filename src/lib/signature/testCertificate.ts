import forge from 'node-forge';

export function makeTestP12(holder: string, password: string, validity: { from?: Date; to?: Date } = {}): Uint8Array {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '0' + forge.util.bytesToHex(forge.random.getBytesSync(8));
  certificate.validity.notBefore = validity.from ?? new Date(Date.now() - 24 * 3600 * 1000);
  certificate.validity.notAfter = validity.to ?? new Date(Date.now() + 30 * 24 * 3600 * 1000);
  // Como los certificados reales: nombres en UTF8String, que forge escribe codificados y lee como bytes.
  // Los tipos de forge dicen «Class», pero el campo guarda el tipo ASN.1.
  const utf8 = forge.asn1.Type.UTF8 as unknown as forge.asn1.Class;
  const attributes = [{ name: 'commonName', value: holder, valueTagClass: utf8 }, { name: 'countryName', value: 'EC' }, { name: 'organizationName', value: 'ENTIDAD DE PRUEBA', valueTagClass: utf8 }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], password, { algorithm: '3des' });
  const der = forge.asn1.toDer(p12).getBytes();
  return Uint8Array.from(der, (char) => char.charCodeAt(0));
}
