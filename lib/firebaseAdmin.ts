import { type App, cert, getApps, initializeApp } from 'firebase-admin/app';
import {
  getMessaging as fbGetMessaging,
  type Messaging,
} from 'firebase-admin/messaging';

/**
 * Firebase Admin singleton for sending FCM push notifications.
 *
 * Credential comes from FIREBASE_SERVICE_ACCOUNT — the service-account JSON
 * (project dompis-app) as a single string, either raw JSON or base64-encoded.
 * When the env var is absent (local/dev), getMessaging() returns null and all
 * callers skip silently.
 */
let app: App | null = null;

export function getMessaging(): Messaging | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  if (!app) {
    const json = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');

    app = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(JSON.parse(json)) });
  }

  return fbGetMessaging(app);
}
