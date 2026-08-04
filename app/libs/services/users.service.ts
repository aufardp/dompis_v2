import prisma from '@/app/libs/prisma';
import bcrypt from 'bcryptjs';
import { deleteCache } from '@/lib/cache';
import { normalizeRoleKey } from '@/app/libs/roles';

export interface CreateUserDTO {
  nik: string;
  nama: string;
  jabatan: string;
  username: string;
  password: string;
  role_id: number;
  area_id: number;
  sa_ids?: number[];
  sa_id?: number;
  region_ids?: number[];
  branch_ids?: number[];
  area_ids?: number[];
}

export interface UpdateUserDTO {
  nik?: string;
  nama?: string;
  jabatan?: string;
  username?: string;
  password?: string;
  role_id?: number;
  area_id?: number;
  sa_ids?: number[];
  sa_id?: number;
  region_ids?: number[];
  branch_ids?: number[];
  area_ids?: number[];
}

export interface CurrentUser {
  id_user: number;
  nama: string;
  jabatan: string;
  role_name: string;
  role_key: string;
}

export interface UserById {
  id_user: number;
  nik: string;
  nama: string;
  jabatan: string;
  username: string;
  password: string;
  role_id: number;
  area_id: number;
  created_at: Date;
  updated_at: Date;
  sa_ids: number[];
  region_ids: number[];
  branch_ids: number[];
  area_ids: number[];
}

export async function getAllUsers(filters?: {
  role_id?: number;
  search?: string;
}) {
  const where: Record<string, any> = {};

  if (filters?.role_id) {
    where.role_id = filters.role_id;
  }

  if (filters?.search) {
    where.OR = [
      { nama: { startsWith: filters.search } },
      { nik: { startsWith: filters.search } },
      { username: { startsWith: filters.search } },
    ];
  }

  const users = await prisma.users.findMany({
    where,
    select: {
      id_user: true,
      nik: true,
      nama: true,
      jabatan: true,
      username: true,
      role_id: true,
      area_id: true,
      created_at: true,
      updated_at: true,
      roles: { select: { key: true, name: true } },
    },
    orderBy: { id_user: 'desc' },
    take: 1000,
  });

  return users;
}

export async function findUserByNik(nik: string, excludeId?: number) {
  return prisma.users.findFirst({
    where: {
      nik,
      ...(excludeId ? { NOT: { id_user: excludeId } } : {}),
    },
    select: {
      id_user: true,
      nik: true,
      nama: true,
      username: true,
      roles: { select: { name: true, key: true } },
    },
  });
}

export async function getUserById(id: number) {
  const user = await prisma.users.findUnique({
    where: { id_user: id },
    include: {
      user_sa: {
        include: {
          service_area: {
            include: { area: true },
          },
        },
      },
      user_region: true,
      user_branch: true,
      user_area: true,
    },
  });

  if (!user) return null;

  const pickIds = (
    rows: { user_id: number | null; sa_id?: number | null; region_id?: number | null; branch_id?: number | null; area_id?: number | null }[],
    key: 'sa_id' | 'region_id' | 'branch_id' | 'area_id',
  ) =>
    rows
      .map((r) => r[key])
      .filter((v): v is number => v !== null && v !== undefined);

  const {
    password: _password,
    user_sa,
    user_region,
    user_branch,
    user_area,
    ...rest
  } = user;

  return {
    ...rest,
    sa_ids: pickIds(user_sa, 'sa_id'),
    sa_areas: user_sa
      .filter((us) => us.sa_id !== null)
      .map((us) => ({
        sa_id: us.sa_id as number,
        area_id: us.service_area?.area_id ?? null,
        nama_sa: us.service_area?.nama_sa ?? null,
        nama_area: us.service_area?.area?.nama_area ?? null,
      })),
    region_ids: pickIds(user_region, 'region_id'),
    branch_ids: pickIds(user_branch, 'branch_id'),
    area_ids: pickIds(user_area, 'area_id'),
  };
}

export async function getCurrentUser(
  id_user: number,
): Promise<CurrentUser | null> {
  const user = await prisma.users.findUnique({
    where: { id_user },
    include: {
      roles: {
        select: { name: true, key: true },
      },
    },
  });

  if (!user) return null;

  return {
    id_user: user.id_user,
    nama: user.nama || '',
    jabatan: user.jabatan || '',
    role_name: user.roles?.name || '',
    role_key: user.roles?.key || '',
  };
}

export async function getUsersByRoleId(roleId: number, search?: string) {
  const where: Record<string, any> = {
    role_id: roleId,
  };

  if (search) {
    where.OR = [{ nama: { startsWith: search } }, { nik: { startsWith: search } }];
  }

  const users = await prisma.users.findMany({
    where,
    select: {
      id_user: true,
      nama: true,
      nik: true,
    },
    orderBy: { nama: 'asc' },
  });

  return users;
}

export async function getUsersByAreaId(areaId: number, search?: string) {
  const where: Record<string, any> = {
    area_id: areaId,
  };

  if (search) {
    where.OR = [{ nama: { startsWith: search } }, { nik: { startsWith: search } }];
  }

  const users = await prisma.users.findMany({
    where,
    select: {
      id_user: true,
      nama: true,
      nik: true,
    },
    orderBy: { nama: 'asc' },
  });

  return users;
}

export async function getUsersBySaId(saId: number, search?: string) {
  const where: Record<string, any> = {
    user_sa: {
      some: {
        sa_id: saId,
      },
    },
  };

  if (search) {
    where.OR = [{ nama: { startsWith: search } }, { nik: { startsWith: search } }];
  }

  const users = await prisma.users.findMany({
    where,
    select: {
      id_user: true,
      nama: true,
      nik: true,
    },
    orderBy: { nama: 'asc' },
  });

  return users;
}

export async function createUser(data: CreateUserDTO) {
  const existing = await prisma.users.findFirst({
    where: {
      OR: [{ username: data.username }, { nik: data.nik }],
    },
  });

  if (existing) {
    throw new Error('Username atau NIK sudah terdaftar');
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const saIds = Array.isArray(data.sa_ids)
    ? data.sa_ids
    : data.sa_id
      ? [data.sa_id]
      : [];

  const user = await prisma.users.create({
    data: {
      nik: data.nik,
      nama: data.nama,
      jabatan: data.jabatan,
      username: data.username,
      password: hashedPassword,
      role_id: data.role_id,
      area_id: data.area_id,
      user_sa: {
        create: saIds.map((saId) => ({
          sa_id: saId,
        })),
      },
      user_region: {
        create: (data.region_ids ?? []).map((regionId) => ({
          region_id: regionId,
        })),
      },
      user_branch: {
        create: (data.branch_ids ?? []).map((branchId) => ({
          branch_id: branchId,
        })),
      },
      user_area: {
        create: (data.area_ids ?? []).map((areaId) => ({
          area_id: areaId,
        })),
      },
    },
  });

  return user.id_user;
}

export async function updateUser(id: number, data: UpdateUserDTO) {
  const existing = await prisma.users.findUnique({
    where: { id_user: id },
  });

  if (!existing) {
    throw new Error('User tidak ditemukan');
  }

  if (data.username && data.username !== existing.username) {
    const dup = await prisma.users.findFirst({
      where: {
        username: data.username,
        NOT: { id_user: id },
      },
    });
    if (dup) {
      throw new Error('Username sudah digunakan');
    }
  }

  if (data.nik && data.nik !== existing.nik) {
    const dup = await prisma.users.findFirst({
      where: {
        nik: data.nik,
        NOT: { id_user: id },
      },
    });
    if (dup) {
      throw new Error('NIK sudah digunakan');
    }
  }

  const updateData: Record<string, any> = {};

  if (data.nik !== undefined) updateData.nik = data.nik;
  if (data.nama !== undefined) updateData.nama = data.nama;
  if (data.jabatan !== undefined) updateData.jabatan = data.jabatan;
  if (data.username !== undefined) updateData.username = data.username;
  if (data.role_id !== undefined) updateData.role_id = data.role_id;
  if (data.area_id !== undefined) updateData.area_id = data.area_id;

  if (data.password !== undefined) {
    updateData.password = await bcrypt.hash(data.password, 10);
  }

  if (Object.keys(updateData).length > 0) {
    updateData.updated_at = new Date();
  }

  if (data.sa_ids !== undefined || data.sa_id !== undefined) {
    await prisma.user_sa.deleteMany({
      where: { user_id: id },
    });

    const saIds = Array.isArray(data.sa_ids)
      ? data.sa_ids
      : data.sa_id
        ? [data.sa_id]
        : [];

    if (saIds.length > 0) {
      await prisma.user_sa.createMany({
        data: saIds.map((saId) => ({
          user_id: id,
          sa_id: saId,
        })),
      });
    }
  }

  if (data.region_ids !== undefined) {
    await prisma.user_region.deleteMany({ where: { user_id: id } });
    if (data.region_ids.length > 0) {
      await prisma.user_region.createMany({
        data: data.region_ids.map((regionId) => ({ user_id: id, region_id: regionId })),
      });
    }
  }

  if (data.branch_ids !== undefined) {
    await prisma.user_branch.deleteMany({ where: { user_id: id } });
    if (data.branch_ids.length > 0) {
      await prisma.user_branch.createMany({
        data: data.branch_ids.map((branchId) => ({ user_id: id, branch_id: branchId })),
      });
    }
  }

  if (data.area_ids !== undefined) {
    await prisma.user_area.deleteMany({ where: { user_id: id } });
    if (data.area_ids.length > 0) {
      await prisma.user_area.createMany({
        data: data.area_ids.map((areaId) => ({ user_id: id, area_id: areaId })),
      });
    }
  }

  const scopeChanged =
    data.sa_ids !== undefined ||
    data.sa_id !== undefined ||
    data.region_ids !== undefined ||
    data.branch_ids !== undefined ||
    data.area_ids !== undefined;
  if (scopeChanged) {
    await deleteCache(`ticket_helpers:workzones:${id}`);
  }

  await prisma.users.update({
    where: { id_user: id },
    data: updateData,
  });

  return true;
}

export async function deleteUser(id: number) {
  const existing = await prisma.users.findUnique({
    where: { id_user: id },
  });

  if (!existing) {
    throw new Error('User tidak ditemukan');
  }

  await prisma.user_sa.deleteMany({
    where: { user_id: id },
  });
  await prisma.user_region.deleteMany({ where: { user_id: id } });
  await prisma.user_branch.deleteMany({ where: { user_id: id } });
  await prisma.user_area.deleteMany({ where: { user_id: id } });

  await prisma.users.delete({
    where: { id_user: id },
  });

  return true;
}

export function canAssignRole(actorRole: string, targetRoleId: number): boolean {
  const normalized = normalizeRoleKey(actorRole);
  const isSuperadmin = normalized === 'superadmin';

  if (targetRoleId === 1) return isSuperadmin;
  if (targetRoleId === 5) {
    return isSuperadmin || normalized === 'admin_branch';
  }
  return true;
}

export async function changePassword(  userId: number,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.users.findUnique({
    where: { id_user: userId },
  });

  if (!user) throw new Error('User tidak ditemukan');

  const valid = await bcrypt.compare(currentPassword, user.password || '');
  if (!valid) throw new Error('Password saat ini salah');

  const hashed = await bcrypt.hash(newPassword, 10);

  await prisma.users.update({
    where: { id_user: userId },
    data: {
      password: hashed,
      updated_at: new Date(),
    },
  });

  return true;
}

export type UserRow = {
  id_user: number;
  username: string;
  password: string | null;
  role_id: number;
  role_key: string | null;
};

export async function findUserByUsername(
  username: string,
): Promise<UserRow | null> {
  const user = await prisma.users.findFirst({
    where: { username },
    include: { roles: { select: { key: true } } },
  });

  if (!user) return null;

  return {
    id_user: user.id_user,
    username: user.username || '',
    password: user.password,
    role_id: user.role_id || 0,
    role_key: user.roles?.key || null,
  };
}

export async function findUserWorkzones(userId: number): Promise<string[]> {
  const userSas = await prisma.user_sa.findMany({
    where: { user_id: userId },
    include: { service_area: { select: { nama_sa: true } } },
  });

  return userSas
    .map(
      (usa: { service_area: { nama_sa: string | null } | null }) =>
        usa.service_area?.nama_sa,
    )
    .filter(
      (sa: string | null | undefined): sa is string =>
        sa !== null && sa !== undefined,
    );
}
