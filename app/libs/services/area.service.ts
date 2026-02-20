import prisma from '@/app/libs/prisma';

export async function getAllArea() {
  const areas = await prisma.area.findMany({
    orderBy: { id_area: 'asc' },
  });
  return areas;
}

export async function getAreaById(id: string) {
  if (!id) {
    throw new Error('ID area wajib diisi');
  }

  const area = await prisma.area.findUnique({
    where: { id_area: Number(id) },
  });

  if (!area) return null;

  return {
    id: area.id_area,
    nama_area: area.nama_area,
    created_at: area.created_at,
    updated_at: area.updated_at,
  };
}

export async function createArea(data: { nama_area: string }) {
  const existing = await prisma.area.findFirst({
    where: { nama_area: data.nama_area },
  });

  if (existing) {
    throw new Error('Area sudah ada');
  }

  const area = await prisma.area.create({
    data: { nama_area: data.nama_area },
  });

  return area.id_area;
}

export async function updateArea(id: string, data: { nama_area?: string }) {
  const existing = await prisma.area.findUnique({
    where: { id_area: Number(id) },
  });

  if (!existing) {
    throw new Error('Area tidak ditemukan');
  }

  if (data.nama_area) {
    const duplicate = await prisma.area.findFirst({
      where: {
        nama_area: data.nama_area,
        NOT: { id_area: Number(id) },
      },
    });

    if (duplicate) {
      throw new Error('Nama area sudah ada');
    }
  }

  await prisma.area.update({
    where: { id_area: Number(id) },
    data: {
      nama_area: data.nama_area,
      updated_at: new Date(),
    },
  });
}

export async function deleteArea(id: string) {
  const existing = await prisma.area.findUnique({
    where: { id_area: Number(id) },
  });

  if (!existing) {
    throw new Error('Area tidak ditemukan');
  }

  await prisma.area.delete({
    where: { id_area: Number(id) },
  });
}
