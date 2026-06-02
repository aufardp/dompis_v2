import assert from 'node:assert/strict';
import {
  createDefaultAttendancePayload,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from '@/app/libs/auth';
import { validateEvidenceFiles } from '@/app/libs/upload';

function ensureEnv() {
  process.env.JWT_ACCESS_SECRET ||= 'phase1-access-secret-for-local-test';
  process.env.JWT_REFRESH_SECRET ||= 'phase1-refresh-secret-for-local-test';
}

function createPayload(): AccessTokenPayload {
  return {
    id_user: 123,
    role: 'admin',
    role_id: 2,
    ...createDefaultAttendancePayload(),
  };
}

function createPngBytes() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92,
    0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

async function expectReject(fn: () => Promise<unknown>, pattern: RegExp) {
  let failed = false;
  try {
    await fn();
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, pattern);
  }

  assert.equal(failed, true, `Expected rejection matching ${pattern}`);
}

async function testAuthBoundary() {
  const payload = createPayload();
  const accessToken = await signAccessToken(payload);
  const refreshToken = await signRefreshToken(payload);

  const verifiedAccess = await verifyAccessToken(accessToken);
  const verifiedRefresh = await verifyRefreshToken(refreshToken);

  assert.equal(verifiedAccess.id_user, payload.id_user);
  assert.equal(verifiedRefresh.id_user, payload.id_user);

  await expectReject(
    () => verifyAccessToken(refreshToken),
    /invalid or expired access token/i,
  );
  await expectReject(
    () => verifyRefreshToken(accessToken),
    /invalid or expired refresh token/i,
  );
}

async function testUploadValidation() {
  const validFile = new File([createPngBytes()], 'proof.png', {
    type: 'image/png',
  });
  await validateEvidenceFiles([validFile]);

  const wrongMime = new File([createPngBytes()], 'proof.png', {
    type: 'application/octet-stream',
  });
  await expectReject(
    () => validateEvidenceFiles([wrongMime]),
    /tipe file tidak didukung/i,
  );

  const wrongSignature = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'proof.png', {
    type: 'image/png',
  });
  await expectReject(
    () => validateEvidenceFiles([wrongSignature]),
    /isi file tidak valid/i,
  );

  const wrongExtension = new File([createPngBytes()], '../proof.exe', {
    type: 'image/png',
  });
  await expectReject(
    () => validateEvidenceFiles([wrongExtension]),
    /format file tidak didukung/i,
  );
}

async function main() {
  ensureEnv();
  await testAuthBoundary();
  await testUploadValidation();
  console.log('[test:phase1] auth boundary and upload validation passed');
}

main().catch((error) => {
  console.error('[test:phase1] failed:', error);
  process.exit(1);
});
