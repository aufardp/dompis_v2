// app/libs/priority/access.ts

import prisma from '../prisma';
import { normalizeRoleKey } from '../roles';
import { getOrSetCache } from '@/lib/cache';
import { BRANCH_LIST } from './constants';

const ACCESS_CACHE_TTL = 60; // 60 detik per user

export async function checkPriorityAccess(
  userId: number,
  roleKey: string,
): Promise<{ hasAccess: boolean; branchIds: number[] }> {
  const normalizedRole = normalizeRoleKey(roleKey);

  if (normalizedRole === 'superadmin') {
    return { hasAccess: true, branchIds: BRANCH_LIST.map((b) => b.id) };
  }

  const allowedRoles = ['admin', 'admin_branch', 'senior_leader'];
  if (!allowedRoles.includes(normalizedRole)) {
    return { hasAccess: false, branchIds: [] };
  }

  return getOrSetCache(
    `priority:access:${userId}`,
    async () => {
      const targetBranchIds = new Set(BRANCH_LIST.map((b) => b.id));
      const userConnectedBranchIds = new Set<number>();

      // Check direct user branch
      // Include: users.branch_id, users.area.branch_id, user_branch.branch_id
      const user = await prisma.users.findUnique({
        where: { id_user: userId },
        select: {
          branch_id: true,
          area: { select: { branch_id: true } },
          user_branch: { select: { branch_id: true } },
        },
      });

      if (user?.branch_id) {
        userConnectedBranchIds.add(user.branch_id);
      }
      if (user?.area?.branch_id) {
        userConnectedBranchIds.add(user.area.branch_id);
      }
      user?.user_branch.forEach((ub: any) => {
        if (ub.branch_id) userConnectedBranchIds.add(ub.branch_id);
      });

      // Check if any of the user's connected branches overlap with the target priority branches
      const overlappingBranchIds = [...userConnectedBranchIds].filter((id) =>
        targetBranchIds.has(id as any),
      );

      return {
        hasAccess: overlappingBranchIds.length > 0,
        branchIds: overlappingBranchIds,
      };
    },
    ACCESS_CACHE_TTL,
  );
}
