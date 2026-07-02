import { cookies } from 'next/headers';

const WORKZONE_COOKIE_KEY = 'dompis:selected-workzone';

export async function getInitialWorkzoneScope(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(WORKZONE_COOKIE_KEY)?.value ?? '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  } catch {
    return '';
  }
}
