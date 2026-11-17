const vaultService = require('../../src/services/vault');

describe('AES-256-GCM Vault Service (Unit Tests)', () => {
  const sampleKey = 'gsk_test_api_key_1234567890abcdefghijklmnop';

  test('encryptSecret should generate valid encryptedValue, iv (12-byte hex), authTag (16-byte hex), and maskedPreview', () => {
    const encrypted = vaultService.encryptSecret(sampleKey);

    expect(encrypted).toHaveProperty('encryptedValue');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('authTag');
    expect(encrypted).toHaveProperty('maskedPreview');

    // IV must be 12 bytes = 24 hex characters
    expect(encrypted.iv.length).toBe(24);
    // AuthTag must be 16 bytes = 32 hex characters
    expect(encrypted.authTag.length).toBe(32);
    // Masked preview should match format
    expect(encrypted.maskedPreview).toMatch(/^gsk_••••[a-z0-9]{4}$/);
    // Plaintext should not match encrypted value
    expect(encrypted.encryptedValue).not.toBe(sampleKey);
  });

  test('decryptSecret should accurately recover original plaintext using auth tag', () => {
    const encrypted = vaultService.encryptSecret(sampleKey);
    const decrypted = vaultService.decryptSecret(
      encrypted.encryptedValue,
      encrypted.iv,
      encrypted.authTag
    );

    expect(decrypted).toBe(sampleKey);
  });

  test('decryptSecret should throw authentication error if ciphertext is tampered with', () => {
    const encrypted = vaultService.encryptSecret(sampleKey);
    // Tamper with the ciphertext by flipping characters
    const tamperedCipher =
      encrypted.encryptedValue.slice(0, -2) + (encrypted.encryptedValue.endsWith('a') ? 'b' : 'a');

    expect(() => {
      vaultService.decryptSecret(tamperedCipher, encrypted.iv, encrypted.authTag);
    }).toThrow();
  });

  test('decryptSecret should throw error if authTag is altered or invalid', () => {
    const encrypted = vaultService.encryptSecret(sampleKey);
    const invalidAuthTag = '00000000000000000000000000000000';

    expect(() => {
      vaultService.decryptSecret(encrypted.encryptedValue, encrypted.iv, invalidAuthTag);
    }).toThrow();
  });

  test('generateMaskedPreview should mask strings longer than 8 characters properly', () => {
    const preview = vaultService.generateMaskedPreview('AIzaSy123456789DemoKey');
    expect(preview).toBe('AIza••••oKey');
  });

  test('generateMaskedPreview should fully mask short strings', () => {
    const preview = vaultService.generateMaskedPreview('short');
    expect(preview).toBe('••••••••');
  });

  test('scrubSensitiveData should scrub nested secrets, passwords, and tokens', () => {
    const payload = {
      name: 'Test Org',
      password: 'secretPassword123',
      nested: {
        apiKey: 'sensitive-key-val',
        user: 'alice',
      },
      list: [{ secret: 'should-be-hidden' }, { normal: 'visible' }],
    };

    const scrubbed = vaultService.scrubSensitiveData(payload);

    expect(scrubbed.name).toBe('Test Org');
    expect(scrubbed.password).toBe('[REDACTED]');
    expect(scrubbed.nested.apiKey).toBe('[REDACTED]');
    expect(scrubbed.nested.user).toBe('alice');
    expect(scrubbed.list[0].secret).toBe('[REDACTED]');
    expect(scrubbed.list[1].normal).toBe('visible');
  });
});
