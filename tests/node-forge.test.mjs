import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign, privateEncrypt, constants } from 'node:crypto'
import { createRequire } from 'node:module'
import { createSecureContext } from 'node:tls'
import test from 'node:test'

const forge = createRequire(import.meta.url)('node-forge')
// Keys remain in memory; no private material is written to logs or fixtures.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const message = 'Formula AI offline RSA compatibility regression'
const digest = createHash('sha256').update(message).digest('binary')
const publicRsa = forge.pki.publicKeyFromPem(publicKey)
const privateRsa = forge.pki.privateKeyFromPem(privateKey)

function certificate() {
  const cert = forge.pki.createCertificate()
  cert.publicKey = publicRsa
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z')
  cert.validity.notAfter = new Date('2027-01-01T00:00:00Z')
  const subject = [{ name: 'commonName', value: 'localhost' }]
  cert.setSubject(subject)
  cert.setIssuer(subject)
  cert.sign(privateRsa, forge.md.sha256.create())
  return cert
}

test('RSA SHA-256 signatures interoperate with Node and reject a different digest', () => {
  const signature = sign('sha256', Buffer.from(message), privateKey).toString('binary')
  assert.equal(publicRsa.verify(digest, signature), true)
  assert.equal(
    publicRsa.verify(createHash('sha256').update('different').digest('binary'), signature),
    false,
  )
})

test('PEM Buffer input remains usable for RSA signing', () => {
  const key = forge.pki.privateKeyFromPem(Buffer.from(privateKey))
  const md = forge.md.sha256.create().update(message)
  assert.equal(publicRsa.verify(digest, key.sign(md)), true)
})

test('self-signed certificate survives PEM round trip', () => {
  const restored = forge.pki.certificateFromPem(forge.pki.certificateToPem(certificate()))
  assert.equal(restored.verify(restored), true)
})

test('PKCS#12 output is readable by both forge and Node TLS', () => {
  const password = 'offline-test-only'
  const asn1 = forge.pkcs12.toPkcs12Asn1(privateRsa, [certificate()], password, {
    algorithm: 'aes256',
  })
  const bytes = forge.asn1.toDer(asn1).getBytes()
  assert.ok(forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes), password))
  assert.ok(createSecureContext({ pfx: Buffer.from(bytes, 'binary'), passphrase: password }))
})

test('RSA verification rejects extra nested DigestAlgorithm fields (GHSA-86w9-cpqp-85rv)', () => {
  const a = forge.asn1
  const c = a.Class.UNIVERSAL
  const t = a.Type
  // Signed with our own private key to test strict parsing, not a keyless forgery exploit.
  const malformed = a.create(c, t.SEQUENCE, true, [
    a.create(c, t.SEQUENCE, true, [
      a.create(c, t.OID, false, a.oidToDer(forge.pki.oids.sha256).getBytes()),
      a.create(c, t.NULL, false, ''),
      a.create(c, t.NULL, false, ''),
    ]),
    a.create(c, t.OCTETSTRING, false, digest),
  ])
  const signature = privateEncrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(a.toDer(malformed).getBytes(), 'binary'),
  ).toString('binary')
  let accepted = false
  try {
    accepted = publicRsa.verify(digest, signature)
  } catch {
    // Rejecting malformed ASN.1 with an exception is also a safe outcome.
  }
  assert.equal(accepted, false)
})
