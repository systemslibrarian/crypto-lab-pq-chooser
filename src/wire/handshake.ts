/**
 * What one TLS 1.3 key exchange and one server authentication actually cost on
 * the wire, in bytes, for a chosen (KEM, signature) pair.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE OTHER HANDSHAKE CALCULATORS IN THIS FLEET:
 * it is not a sum of published constants. The page runs the KEM, runs the
 * signature, concatenates the four buffers it is holding, and reads `.length`
 * off the concatenation. `crypto-lab-pq-families` computes the same figure from
 * hardcoded constants and `crypto-lab-hybrid-guide` carries three hardcoded
 * rows; both are correct today and neither would notice if it stopped being.
 *
 * HONEST SCOPE, stated on the panel as well as here. This counts the four
 * cryptographic objects that dominate a post-quantum handshake's growth:
 *
 *   ClientHello  key_share      the client's KEM public key
 *   ServerHello  key_share      the KEM ciphertext
 *   Certificate                 the server's signature public key
 *   CertificateVerify           the signature over the transcript
 *
 * It is NOT a full handshake. It excludes record and message framing, the
 * extension and cipher-suite lists, session tickets, the certificate chain
 * above the leaf, the X.509 wrapper around the public key, ALPN, SNI, and the
 * Finished MACs. A real ClientHello is several hundred bytes before a key share
 * is added. What this measures is the part that changes by kilobytes when you
 * move from X25519 + Ed25519 to a post-quantum pair, which is the part the
 * choice actually decides.
 */

import { KEMS, SIGNERS, DERIVATION_MESSAGE } from '../derive/adapters';
import { SCHEMES_BY_ID } from '../derive/schemes';

export interface HandshakePart {
  /** The TLS message this object rides in. */
  message: string;
  /** What the object is. */
  what: string;
  /** Read off the real buffer. */
  bytes: number;
}

export interface HandshakeCost {
  kemId: string;
  kemLabel: string;
  sigId: string;
  sigLabel: string;
  parts: HandshakePart[];
  /**
   * The length of the ACTUAL concatenation of the four buffers — not a sum of
   * the four numbers above. They agree, necessarily; the point is which one the
   * page computed. `sumOfParts` is carried beside it so the claims suite can
   * check that what is printed as the total is the total of what is printed as
   * the parts, which is the cross-check that catches a renderer, not the maths.
   */
  totalBytes: number;
  sumOfParts: number;
  /** True when the signature scheme's length varies, so this total is one draw. */
  signatureVariable: boolean;
}

/** Joins buffers end to end. The result's `.length` is the measurement. */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export function computeHandshake(kemId: string, sigId: string): HandshakeCost {
  const kemScheme = SCHEMES_BY_ID.get(kemId);
  const sigScheme = SCHEMES_BY_ID.get(sigId);
  if (!kemScheme || kemScheme.kind !== 'kem') throw new Error(`not a KEM: ${kemId}`);
  if (!sigScheme || sigScheme.kind !== 'signature') throw new Error(`not a signature scheme: ${sigId}`);

  const kem = KEMS[kemId];
  const signer = SIGNERS[sigId];
  if (!kem) throw new Error(`@noble/post-quantum exports no KEM named ${kemId}`);
  if (!signer) throw new Error(`@noble/post-quantum exports no signer named ${sigId}`);

  const clientKeys = kem.keygen();
  const { cipherText } = kem.encapsulate(clientKeys.publicKey);
  const serverKeys = signer.keygen();
  const signature = signer.sign(DERIVATION_MESSAGE, serverKeys.secretKey);

  // The four objects, in the order they cross the wire.
  const buffers = [clientKeys.publicKey, cipherText, serverKeys.publicKey, signature];
  const wire = concatBytes(buffers);

  const parts: HandshakePart[] = [
    { message: 'ClientHello', what: `key_share — ${kemScheme.label} public key`, bytes: clientKeys.publicKey.length },
    { message: 'ServerHello', what: `key_share — ${kemScheme.label} ciphertext`, bytes: cipherText.length },
    { message: 'Certificate', what: `${sigScheme.label} public key`, bytes: serverKeys.publicKey.length },
    { message: 'CertificateVerify', what: `${sigScheme.label} signature`, bytes: signature.length },
  ];

  return {
    kemId,
    kemLabel: kemScheme.label,
    sigId,
    sigLabel: sigScheme.label,
    parts,
    totalBytes: wire.length,
    sumOfParts: parts.reduce((acc, p) => acc + p.bytes, 0),
    signatureVariable: sigScheme.variableLength === true,
  };
}

export interface HybridOverhead {
  hybridId: string;
  hybridLabel: string;
  baseId: string;
  baseLabel: string;
  /** Public key + ciphertext, from real output, for each. */
  hybridBytes: number;
  baseBytes: number;
  overheadBytes: number;
  /** Derived from the two byte counts above; never quoted. */
  overheadPercent: number;
}

/**
 * The hybrid overhead, as a measurement of two byte lengths.
 *
 * "A hybrid costs about 3% more than ML-KEM alone" is quoted widely enough to
 * feel like a fact. Here it is two `keygen()` calls, two `encapsulate()` calls
 * and a division — so if the concatenation ever changed shape, the number would
 * move instead of staying comfortingly familiar.
 */
export function computeHybridOverhead(hybridId: string, baseId: string): HybridOverhead {
  const measure = (id: string): { label: string; bytes: number } => {
    const scheme = SCHEMES_BY_ID.get(id);
    const kem = KEMS[id];
    if (!scheme || !kem) throw new Error(`not a derivable KEM: ${id}`);
    const keys = kem.keygen();
    const { cipherText } = kem.encapsulate(keys.publicKey);
    return { label: scheme.label, bytes: concatBytes([keys.publicKey, cipherText]).length };
  };
  const hybrid = measure(hybridId);
  const base = measure(baseId);
  return {
    hybridId,
    hybridLabel: hybrid.label,
    baseId,
    baseLabel: base.label,
    hybridBytes: hybrid.bytes,
    baseBytes: base.bytes,
    overheadBytes: hybrid.bytes - base.bytes,
    overheadPercent: ((hybrid.bytes - base.bytes) / base.bytes) * 100,
  };
}
