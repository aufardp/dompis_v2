import prisma from '@/app/libs/prisma';

export async function getAllRoles() {
  const roles = await prisma.roles.findMany({
    orderBy: { id_role: 'asc' },
  });
  return roles;
}

export async function getRolesById(id: string) {
  if (!id) {
    throw new Error('ID roles wajib diisi');
  }

  const role = await prisma.roles.findUnique({
    where: { id_role: Number(id) },
  });

  return role;
}
