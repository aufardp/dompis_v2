export const INVITE_CONFIG = {
  expiresInHours: 24,
  allowedRoles: ['teknisi'] as const,
  maxUsesPerToken: 1,
  tokenType: 'invite' as const,
  teknisiInviteTtlSeconds: 60,
};
