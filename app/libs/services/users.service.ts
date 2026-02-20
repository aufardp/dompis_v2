import prisma from '@/app/libs/prisma';
import bcrypt from 'bcryptjs';

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
}

export interface CurrentUser {
  id_user: number;
  nama: string;
  jabatan: string;
  role_name: string;
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
      { nama: { contains: filters.search } },
      { nik: { contains: filters.search } },
      { username: { contains: filters.search } },
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
    },
    orderBy: { id_user: 'desc' },
  });

  return users;
}

export async function getUserById(id: number) {
  const user = await prisma.users.findUnique({
    where: { id_user: id },
    include: {
      user_sa: true,
    },
  });

  if (!user) return null;

  const sa_ids = user.user_sa
    .map((us) => us.sa_id)
    .filter((sa): sa is number => sa !== null);

  const { password, user_sa, ...rest } = user as any;
  return { ...rest, sa_ids };
}

export async function getCurrentUser(
  id_user: number,
): Promise<CurrentUser | null> {
  const user = await prisma.users.findUnique({
    where: { id_user },
    include: {
      roles: {
        select: { name: true },
      },
    },
  });

  if (!user) return null;

  return {
    id_user: user.id_user,
    nama: user.nama || '',
    jabatan: user.jabatan || '',
    role_name: user.roles?.name || '',
  };
}

export async function getUsersByRoleId(roleId: number, search?: string) {
  const where: Record<string, any> = {
    role_id: roleId,
  };

  if (search) {
    where.OR = [{ nama: { contains: search } }, { nik: { contains: search } }];
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
    where.OR = [{ nama: { contains: search } }, { nik: { contains: search } }];
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
    where.OR = [{ nama: { contains: search } }, { nik: { contains: search } }];
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

  await prisma.users.delete({
    where: { id_user: id },
  });

  return true;
}

export async function changePassword(
  userId: number,
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
