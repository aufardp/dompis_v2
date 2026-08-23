import { randomBytes, randomInt } from 'crypto';
import sharp from 'sharp';
import { redis, isRedisReady } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';

const TRACK_WIDTH = 320;
const IMAGE_HEIGHT = 160;
const PIECE_SIZE = 40;
const BUMP_RADIUS = 8;
const PIECE_BOX_WIDTH = PIECE_SIZE + BUMP_RADIUS;
const PIECE_BOX_HEIGHT = PIECE_SIZE;
const EDGE_MARGIN = 20;
const CHALLENGE_TTL_SECONDS = 120;
const POSITION_TOLERANCE_PX = 10;
const MIN_SOLVE_MS = 300;
const MAX_ATTEMPTS = 3;

const REDIS_KEY_PREFIX = 'login-captcha:';

type ChallengeRecord = {
  id_user: number;
  remember: boolean;
  targetX: number;
  pieceY: number;
  createdAt: number;
  attempts: number;
};

export type LoginCaptchaChallenge = {
  challengeId: string;
  backgroundImage: string;
  pieceImage: string;
  pieceY: number;
  trackWidth: number;
  imageHeight: number;
  pieceWidth: number;
  pieceHeight: number;
};

export type VerifyCaptchaResult =
  | { ok: true; id_user: number; remember: boolean }
  | { ok: false; reason: string; freshChallenge: LoginCaptchaChallenge | null };

function puzzlePiecePath(x: number, y: number): string {
  const s = PIECE_SIZE;
  const r = BUMP_RADIUS;
  const midY = y + s / 2;
  return [
    `M ${x} ${y}`,
    `L ${x + s} ${y}`,
    `L ${x + s} ${midY - r}`,
    `A ${r} ${r} 0 1 1 ${x + s} ${midY + r}`,
    `L ${x + s} ${y + s}`,
    `L ${x} ${y + s}`,
    'Z',
  ].join(' ');
}

function randomGradientSvg(): string {
  const hue1 = randomInt(0, 360);
  const hue2 = (hue1 + 60 + randomInt(0, 120)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TRACK_WIDTH}" height="${IMAGE_HEIGHT}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue1},65%,55%)" />
        <stop offset="100%" stop-color="hsl(${hue2},65%,45%)" />
      </linearGradient>
    </defs>
    <rect width="${TRACK_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#g)" />
    <circle cx="${randomInt(0, TRACK_WIDTH)}" cy="${randomInt(0, IMAGE_HEIGHT)}" r="${randomInt(20, 50)}" fill="rgba(255,255,255,0.08)" />
    <circle cx="${randomInt(0, TRACK_WIDTH)}" cy="${randomInt(0, IMAGE_HEIGHT)}" r="${randomInt(20, 50)}" fill="rgba(255,255,255,0.08)" />
  </svg>`;
}

function toDataUri(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function redisKey(challengeId: string): string {
  return `${REDIS_KEY_PREFIX}${challengeId}`;
}

async function buildChallengeImages(
  targetX: number,
  pieceY: number,
): Promise<{ backgroundImage: string; pieceImage: string }> {
  const backgroundSvg = randomGradientSvg();
  const backgroundBuffer = await sharp(Buffer.from(backgroundSvg))
    .png()
    .toBuffer();

  const holeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TRACK_WIDTH}" height="${IMAGE_HEIGHT}">
    <path d="${puzzlePiecePath(targetX, pieceY)}" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" />
  </svg>`;
  const backgroundWithHole = await sharp(backgroundBuffer)
    .composite([{ input: Buffer.from(holeSvg) }])
    .png()
    .toBuffer();

  const pieceMaskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIECE_BOX_WIDTH}" height="${PIECE_BOX_HEIGHT}">
    <path d="${puzzlePiecePath(0, 0)}" fill="white" />
  </svg>`;
  const pieceMaskBuffer = await sharp(Buffer.from(pieceMaskSvg)).png().toBuffer();

  const pieceCrop = await sharp(backgroundBuffer)
    .extract({
      left: Math.round(targetX),
      top: Math.round(pieceY),
      width: PIECE_BOX_WIDTH,
      height: PIECE_BOX_HEIGHT,
    })
    .ensureAlpha()
    .toBuffer();

  const pieceImageBuffer = await sharp(pieceCrop)
    .composite([{ input: pieceMaskBuffer, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return {
    backgroundImage: toDataUri(backgroundWithHole),
    pieceImage: toDataUri(pieceImageBuffer),
  };
}

export async function createLoginCaptchaChallenge(params: {
  id_user: number;
  remember: boolean;
}): Promise<LoginCaptchaChallenge> {
  if (!isRedisReady()) {
    throw new Error('Captcha unavailable: Redis not ready');
  }

  const targetX = randomInt(
    EDGE_MARGIN,
    TRACK_WIDTH - PIECE_BOX_WIDTH - EDGE_MARGIN,
  );
  const pieceY = randomInt(10, IMAGE_HEIGHT - PIECE_BOX_HEIGHT - 10);

  const { backgroundImage, pieceImage } = await buildChallengeImages(
    targetX,
    pieceY,
  );

  const challengeId = randomBytes(16).toString('hex');
  const record: ChallengeRecord = {
    id_user: params.id_user,
    remember: params.remember,
    targetX,
    pieceY,
    createdAt: Date.now(),
    attempts: 0,
  };

  await redis.set(
    redisKey(challengeId),
    JSON.stringify(record),
    'EX',
    CHALLENGE_TTL_SECONDS,
  );

  return {
    challengeId,
    backgroundImage,
    pieceImage,
    pieceY,
    trackWidth: TRACK_WIDTH,
    imageHeight: IMAGE_HEIGHT,
    pieceWidth: PIECE_BOX_WIDTH,
    pieceHeight: PIECE_BOX_HEIGHT,
  };
}

export async function verifyLoginCaptchaAnswer(params: {
  challengeId: string;
  sliderX: number;
}): Promise<VerifyCaptchaResult> {
  if (!isRedisReady()) {
    return { ok: false, reason: 'Captcha tidak tersedia, coba lagi.', freshChallenge: null };
  }

  const key = redisKey(params.challengeId);
  const raw = await redis.get(key);
  if (!raw) {
    return {
      ok: false,
      reason: 'Captcha kedaluwarsa. Silakan login ulang.',
      freshChallenge: null,
    };
  }

  let record: ChallengeRecord;
  try {
    record = JSON.parse(raw) as ChallengeRecord;
  } catch (error) {
    logger.warn('[LoginCaptcha] Failed to parse challenge record', {
      error: String(error),
    });
    await redis.del(key);
    return {
      ok: false,
      reason: 'Captcha tidak valid. Silakan login ulang.',
      freshChallenge: null,
    };
  }

  const elapsedMs = Date.now() - record.createdAt;
  const withinTolerance = Math.abs(params.sliderX - record.targetX) <= POSITION_TOLERANCE_PX;
  const answeredTooFast = elapsedMs < MIN_SOLVE_MS;

  if (withinTolerance && !answeredTooFast) {
    await redis.del(key);
    return { ok: true, id_user: record.id_user, remember: record.remember };
  }

  const attempts = record.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(key);
    return {
      ok: false,
      reason: 'Terlalu banyak percobaan captcha gagal. Silakan login ulang.',
      freshChallenge: null,
    };
  }

  await redis.del(key);
  const freshChallenge = await createLoginCaptchaChallenge({
    id_user: record.id_user,
    remember: record.remember,
  });
  // Preserve the attempt counter under the new challenge so the cap still
  // applies across regenerations within one login attempt.
  const freshKey = redisKey(freshChallenge.challengeId);
  const freshRaw = await redis.get(freshKey);
  if (freshRaw) {
    const freshRecord = JSON.parse(freshRaw) as ChallengeRecord;
    freshRecord.attempts = attempts;
    await redis.set(
      freshKey,
      JSON.stringify(freshRecord),
      'EX',
      CHALLENGE_TTL_SECONDS,
    );
  }

  return {
    ok: false,
    reason: 'Posisi belum pas, coba lagi.',
    freshChallenge,
  };
}
