import forge from 'node-forge';
import { readSigner, type SignerCertificate } from '@/lib/signature/certificate';

export type StatementSignature = { statement: string; cms: string };

export type SignStatementInput = {
  statement: string;
  p12: Uint8Array;
  password: string;
  now?: Date;
};

export type SignStatementResult = { signature: StatementSignature; certificate: SignerCertificate };

export function signStatement(input: SignStatementInput): SignStatementResult {
  const now = input.now ?? new Date();
  const signer = readSigner(input.p12, input.password, now);
  const message = forge.pkcs7.createSignedData();
  message.content = forge.util.createBuffer(forge.util.encodeUtf8(input.statement));
  message.addCertificate(signer.x509);
  for (const certificate of signer.chain) message.addCertificate(certificate);
  message.addSigner({
    key: signer.key,
    certificate: signer.x509,
    digestAlgorithm: forge.pki.oids.sha256!,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType!, value: forge.pki.oids.data! },
      { type: forge.pki.oids.messageDigest! },
      { type: forge.pki.oids.signingTime!, value: now.toISOString() },
    ],
  });
  message.sign({ detached: true });
  const der = forge.asn1.toDer(withOriginalIssuer(message.toAsn1(), signer.x509)).getBytes();

  return {
    signature: { statement: input.statement, cms: forge.util.encode64(der) },
    certificate: signer.certificate,
  };
}

type Asn1 = forge.asn1.Asn1;

/**
 * forge rearma el emisor del firmante desde sus campos y codifica dos veces los UTF8String
 * («MARÍA» → «MARÃ\u008dA»): el verificador no encuentra el certificado. Se pone el emisor
 * tal como viene en el certificado; no forma parte de lo firmado.
 */
function withOriginalIssuer(contentInfo: Asn1, certificate: forge.pki.Certificate): Asn1 {
  const tbs = (certificate as forge.pki.Certificate & { tbsCertificate?: Asn1 }).tbsCertificate;
  if (!tbs) return contentInfo;
  const fields = tbs.value as Asn1[];
  const issuer = fields[fields[0]?.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC ? 3 : 2];
  const signedData = ((contentInfo.value as Asn1[])[1]?.value as Asn1[] | undefined)?.[0];
  const signerInfos = (signedData?.value as Asn1[] | undefined)?.at(-1);
  if (!issuer || !signerInfos) return contentInfo;
  for (const signerInfo of signerInfos.value as Asn1[]) {
    const issuerAndSerial = (signerInfo.value as Asn1[])[1];
    if (issuerAndSerial) (issuerAndSerial.value as Asn1[])[0] = issuer;
  }
  return contentInfo;
}
