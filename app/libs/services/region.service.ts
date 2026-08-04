import prisma from '@/app/libs/prisma';

export async function createRegion(data: { nama_region: string; is_active?: boolean }) {
  const existing = await prisma.region.findFirst({
    where: { nama_region: data.nama_region },
  });

  if (existing) {
    throw new Error('Region sudah ada');
  }

  const region = await prisma.region.create({
    data: {
      nama_region: data.nama_region,
      is_active: data.is_active ?? true,
    },
  });

  return region.id_region;
}

export async function updateRegion(
  id: number,
  data: { nama_region?: string; is_active?: boolean },
) {
  const existing = await prisma.region.findUnique({
    where: { id_region: id },
  });

  if (!existing) {
    throw new Error('Region tidak ditemukan');
  }

  if (data.nama_region && data.nama_region !== existing.nama_region) {
    const duplicate = await prisma.region.findFirst({
      where: {
        nama_region: data.nama_region,
        NOT: { id_region: id },
      },
    });

    if (duplicate) {
      throw new Error('Nama region sudah ada');
    }
  }

  await prisma.region.update({
    where: { id_region: id },
    data: {
      nama_region: data.nama_region,
      is_active: data.is_active,
      updated_at: new Date(),
    },
  });
}

export async function deleteRegion(id: number) {
  const existing = await prisma.region.findUnique({
    where: { id_region: id },
    include: { branches: { select: { id_branch: true } } },
  });

  if (!existing) {
    throw new Error('Region tidak ditemukan');
  }

  if (existing.branches.length > 0) {
    throw new Error('Region masih memiliki branch. Hapus branch terlebih dahulu.');
  }

  await prisma.region.delete({
    where: { id_region: id },
  });
}
