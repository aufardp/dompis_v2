import prisma from '@/app/libs/prisma';

export async function getBranchesByRegion(region_id?: number, branchIds?: number[]) {
  const branches = await prisma.branch.findMany({
    where: {
      ...(region_id ? { region_id } : {}),
      ...(branchIds ? { id_branch: { in: branchIds } } : {}),
    },
    include: {
      region: { select: { id_region: true, nama_region: true } },
      areas: { select: { id_area: true, nama_area: true } },
    },
    orderBy: { nama_branch: 'asc' },
  });

  return branches.map((b) => ({
    id_branch: b.id_branch,
    nama_branch: b.nama_branch,
    kode_branch: b.kode_branch,
    region_id: b.region_id,
    region: b.region?.nama_region ?? null,
    areas: b.areas,
  }));
}

export async function createBranch(data: {
  nama_branch: string;
  kode_branch: string;
  region_id: number;
}) {
  const region = await prisma.region.findUnique({
    where: { id_region: data.region_id },
  });

  if (!region) {
    throw new Error('Region tidak ditemukan');
  }

  const duplicate = await prisma.branch.findFirst({
    where: { kode_branch: data.kode_branch },
  });

  if (duplicate) {
    throw new Error('Kode branch sudah ada');
  }

  const branch = await prisma.branch.create({
    data: {
      nama_branch: data.nama_branch,
      kode_branch: data.kode_branch,
      region_id: data.region_id,
    },
  });

  return branch.id_branch;
}

export async function updateBranch(
  id: number,
  data: { nama_branch?: string; kode_branch?: string; region_id?: number },
) {
  const existing = await prisma.branch.findUnique({
    where: { id_branch: id },
  });

  if (!existing) {
    throw new Error('Branch tidak ditemukan');
  }

  if (data.kode_branch && data.kode_branch !== existing.kode_branch) {
    const duplicate = await prisma.branch.findFirst({
      where: {
        kode_branch: data.kode_branch,
        NOT: { id_branch: id },
      },
    });

    if (duplicate) {
      throw new Error('Kode branch sudah digunakan');
    }
  }

  if (data.region_id) {
    const region = await prisma.region.findUnique({
      where: { id_region: data.region_id },
    });

    if (!region) {
      throw new Error('Region tidak ditemukan');
    }
  }

  await prisma.branch.update({
    where: { id_branch: id },
    data: {
      nama_branch: data.nama_branch,
      kode_branch: data.kode_branch,
      region_id: data.region_id,
      updated_at: new Date(),
    },
  });
}

export async function deleteBranch(id: number) {
  const existing = await prisma.branch.findUnique({
    where: { id_branch: id },
    include: { areas: { select: { id_area: true } } },
  });

  if (!existing) {
    throw new Error('Branch tidak ditemukan');
  }

  if (existing.areas.length > 0) {
    throw new Error('Branch masih memiliki area. Hapus area terlebih dahulu.');
  }

  await prisma.branch.delete({
    where: { id_branch: id },
  });
}
