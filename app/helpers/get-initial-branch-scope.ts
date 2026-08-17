import { cookies } from 'next/headers';

const BRANCH_COOKIE_KEY = 'dompis:selected-branch';

export async function getInitialBranchScope(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(BRANCH_COOKIE_KEY)?.value ?? '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  } catch {
    return '';
  }
}
