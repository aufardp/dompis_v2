import { normalizeRoleKey } from '@/app/libs/roles';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';

export function getScopePartFromResolved(
  isSuperAdmin: boolean,
  role: string,
  userId: number,
): string {
  const r = normalizeRoleKey(role);
  if (r === 'superadmin') return 'sa';
  if (r === 'teknisi') return `tek:${userId}`;
  return isSuperAdmin ? 'sa' : 'adm';
}

export async function getDashboardScopePart(
  role: string,
  userId: number,
): Promise<string> {
  const r = normalizeRoleKey(role);
  if (r === 'superadmin') return 'sa';
  if (r === 'teknisi') return `tek:${userId}`;
  const wz = await getWorkzonesForUser(userId);
  if (wz.length === 0) return 'wz:empty';
  return `wz:${wz.slice().sort().join(',')}`;
}

export function buildScopeKeyWithWorkzones(
  isSuperAdmin: boolean,
  role: string,
  userId: number,
  workzones: string[] | null,
): string {
  const r = normalizeRoleKey(role);
  if (r === 'superadmin' || isSuperAdmin) return 'sa';
  if (r === 'teknisi') return `tek:${userId}`;
  if (!workzones || workzones.length === 0) return 'wz:empty';
  return `wz:${workzones.slice().sort().join(',')}`;
}
