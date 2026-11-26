import assert from "node:assert/strict";
import test from "node:test";

const { sealSecret, openSecret, isSealedSecret } = await import("../../src/core/security/secret-box");

test("stored credentials are encrypted, authenticated and round-trip", () => {
  const sealed = sealSecret("smtp-p@ss word")!;
  assert.ok(isSealedSecret(sealed));
  assert.ok(!sealed.includes("smtp-p@ss"), "plaintext never appears in the stored value");
  assert.notEqual(sealSecret("smtp-p@ss word"), sealed, "a fresh IV per encryption");
  assert.equal(openSecret(sealed), "smtp-p@ss word");
  assert.equal(sealSecret(sealed), sealed, "sealing twice does not double-encrypt");
});

test("legacy plaintext still reads; empty stays empty; tampered or foreign values read as missing", () => {
  assert.equal(openSecret("legacy-plain"), "legacy-plain");
  assert.equal(sealSecret(""), null);
  assert.equal(sealSecret(null), null);
  assert.equal(openSecret(null), null);

  const sealed = sealSecret("secret")!;
  const raw = Buffer.from(sealed.slice("enc:v1:".length), "base64");
  raw[raw.length - 1] ^= 0xff;
  assert.equal(openSecret("enc:v1:" + raw.toString("base64")), null, "GCM tag rejects tampering");

  const original = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = "a-completely-different-secret-of-sufficient-length-123";
  try {
    assert.equal(openSecret(sealed), null, "a value sealed under another secret cannot be opened");
  } finally {
    process.env.BETTER_AUTH_SECRET = original;
  }
  assert.equal(openSecret(sealed), "secret");
});
