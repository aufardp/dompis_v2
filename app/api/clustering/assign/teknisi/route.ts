export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import prisma from '@/app/libs/prisma';

// GET /api/clustering/assign/teknisi?cluster_id=1&date=2026-04-03
// Returns: daftar teknisi yang sudah absen di cluster SA hari ini + workload
export async function GET(req: Request) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { searchParams } = new URL(req.url);

    const clusterIdParam = searchParams.get('cluster_id');
    const dateParam = searchParams.get('date');

    if (!clusterIdParam) {
      return NextResponse.json(
        { success: false, message: 'cluster_id wajib diisi' },
        { status: 400 },
      );
    }

    const clusterId = Number(clusterIdParam);

    // 1. Ambil cluster dan sa_id-nya
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      select: { id: true, sa_id: true, nama_cluster: true },
    });

    if (!cluster) {
      return NextResponse.json(
        { success: false, message: 'Cluster tidak ditemukan' },
        { status: 404 },
      );
    }

    // 2. Validasi admin punya akses ke SA ini
    const adminSaAccess = await prisma.user_sa.findFirst({
      where: { user_id: user.id_user, sa_id: cluster.sa_id },
    });

    if (!adminSaAccess) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 403 },
      );
    }

    // 3. Ambil semua teknisi di SA yang sama
    const techInSa = await prisma.user_sa.findMany({
      where: { sa_id: cluster.sa_id },
      select: { user_id: true },
    });

    const allTechIds = [
      ...new Set(
        techInSa
          .map((t) => t.user_id)
          .filter((id): id is number => id !== null),
      ),
    ];

    if (!allTechIds.length) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 4. Filter hanya teknisi dengan role_id = 4 (teknisi)
    const teknisiUsers = await prisma.users.findMany({
      where: {
        id_user: { in: allTechIds },
        role_id: 4,
      },
      select: { id_user: true, nama: true, nik: true },
      orderBy: { nama: 'asc' },
    });

    // 5. Filter yang sudah absen hari ini (PRESENT dan LATE keduanya valid)
    // WAJIB gunakan AttendanceService untuk date string WIB yang benar
    const today = dateParam ?? AttendanceService.getTodayDateString();
    const presentIds = await prisma.technician_attendance.findMany({
      where: {
        technician_id: { in: teknisiUsers.map((t) => t.id_user) },
        date: today,
      },
      select: { technician_id: true },
    });
    const presentSet = new Set(presentIds.map((p) => p.technician_id));

    const teknisiHadir = teknisiUsers.filter((t) => presentSet.has(t.id_user));

    // 6. Hitung workload aktif masing-masing
    const workloads = await prisma.ticket.groupBy({
      by: ['teknisi_user_id'],
      where: {
        teknisi_user_id: { in: teknisiHadir.map((t) => t.id_user) },
        STATUS_UPDATE: { in: ['assigned', 'on_progress', 'pending'] },
      },
      _count: { id_ticket: true },
    });
    const loadMap = new Map(
      workloads.map((w) => [w.teknisi_user_id!, w._count.id_ticket]),
    );

    // 7. Ambil teknisi yang sudah di-plot ke cluster ini hari ini
    const existingPlot = await prisma.cluster_assignment.findMany({
      where: { cluster_id: clusterId, assigned_date: today, is_active: true },
      select: { teknisi_id: true },
    });
    const plottedIds = new Set(existingPlot.map((p) => p.teknisi_id));

    const result = teknisiHadir.map((t) => ({
      id_user: t.id_user,
      nama: t.nama,
      nik: t.nik,
      active_tickets: loadMap.get(t.id_user) ?? 0,
      already_plotted: plottedIds.has(t.id_user),
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Terjadi kesalahan'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
