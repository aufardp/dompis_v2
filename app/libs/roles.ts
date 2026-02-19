export type NormalizedRoleKey = 'superadmin' | 'admin' | 'helpdesk' | 'teknisi';

export function normalizeRoleKey(role: string): NormalizedRoleKey {
  const key = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  if (key === 'superadmin' || key === 'super_admin' || key === 'super-admin') {
    return 'superadmin';
  }
  if (key === 'admin') return 'admin';
  if (key === 'helpdesk') return 'helpdesk';
  if (key === 'teknisi' || key === 'technician') return 'teknisi';

  throw new Error('Invalid role');
}

export function roleKeyToRoleId(role: NormalizedRoleKey): number {
  // `roles` table mapping in this project:
  // 1: superadmin, 2: admin, 3: helpdesk, 4: teknisi
  switch (role) {
    case 'superadmin':
      return 1;
    case 'admin':
      return 2;
    case 'helpdesk':
      return 3;
    case 'teknisi':
      return 4;
  }
}

export function assertRoleAllowed(
  role: NormalizedRoleKey,
  allowed: readonly NormalizedRoleKey[],
) {
  if (!allowed.includes(role)) {
    throw new Error('Forbidden - Access denied');
  }
}
