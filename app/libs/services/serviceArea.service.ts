import prisma from '@/app/libs/prisma';

export async function getAllServiceArea() {
  const serviceAreas = await prisma.service_area.findMany({
    include: { area: true },
    orderBy: { id_sa: 'asc' },
  });

  return serviceAreas.map((sa) => ({
    id: sa.id_sa,
    serviceArea: sa.nama_sa,
    area: sa.area?.nama_area || null,
  }));
}

export async function getServiceAreaById(id: string) {
  if (!id) {
    throw new Error('ID wajib diisi');
  }

  const sa = await prisma.service_area.findUnique({
    where: { id_sa: Number(id) },
  });

  if (!sa) return null;

  return {
    id: sa.id_sa,
    nama_sa: sa.nama_sa,
    area_id: sa.area_id,
    created_at: sa.created_at,
    updated_at: sa.updated_at,
  };
}

export async function getServiceAreaByArea(area_id: string) {
  const serviceAreas = await prisma.service_area.findMany({
    where: { area_id: Number(area_id) },
    orderBy: { id_sa: 'asc' },
  });

  return serviceAreas.map((sa) => ({
    value: sa.id_sa,
    label: sa.nama_sa,
  }));
}

export async function createServiceArea(data: {
  nama_sa: string;
  area_id: number;
}) {
  const area = await prisma.area.findUnique({
    where: { id_area: data.area_id },
  });

  if (!area) {
    throw new Error('Area tidak ditemukan');
  }

  const duplicate = await prisma.service_area.findFirst({
    where: {
      nama_sa: data.nama_sa,
      area_id: data.area_id,
    },
  });

  if (duplicate) {
    throw new Error('Service Area sudah ada di area tersebut');
  }

  const sa = await prisma.service_area.create({
    data: {
      nama_sa: data.nama_sa,
      area_id: data.area_id,
    },
  });

  return sa.id_sa;
}

export async function updateServiceArea(
  id: string,
  data: { nama_sa?: string; area_id?: string },
) {
  const updateData: Record<string, any> = {};

  if (data.nama_sa !== undefined) {
    updateData.nama_sa = data.nama_sa;
  }

  if (data.area_id !== undefined) {
    updateData.area_id = Number(data.area_id);
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('No data to update');
  }

  updateData.updated_at = new Date();

  await prisma.service_area.update({
    where: { id_sa: Number(id) },
    data: updateData,
  });
}

export async function deleteServiceArea(id: string) {
  const existing = await prisma.service_area.findUnique({
    where: { id_sa: Number(id) },
  });

  if (!existing) {
    throw new Error('Data tidak ditemukan');
  }

  await prisma.service_area.delete({
    where: { id_sa: Number(id) },
  });
}
