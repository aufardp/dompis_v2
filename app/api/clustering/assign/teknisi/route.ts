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
          .map((t: { user_id: number | null }) => t.user_id)
          .filter((id: number | null): id is number => id !== null),
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

    // 5. Filter yang sudah absen - gunakan tanggal dari parameter atau default ke hari ini
    // Format: YYYY-MM-DD (sesuai dengan format di database)
    const targetDate = dateParam 
      ? dateParam 
      : new Date().toISOString().split('T')[0];
    
    const presentIds = await prisma.technician_attendance.findMany({
      where: {
        technician_id: { in: teknisiUsers.map((t: { id_user: number }) => t.id_user) },
        date: targetDate,
      },
      select: { technician_id: true },
    });
    
    const presentSet = new Set(presentIds.map((p: { technician_id: number }) => p.technician_id));
    const teknisiHadir = teknisiUsers.filter((t: { id_user: number; nama: string | null; nik: string | null }) => presentSet.has(t.id_user));

    // 6. Ambil nama workzone dari SA untuk filter tickets
    const serviceArea = await prisma.service_area.findUnique({
      where: { id_sa: cluster.sa_id },
      select: { nama_sa: true },
    });
    const workzoneName = serviceArea?.nama_sa || '';

    // 7. Hitung workload aktif - HANYA ticket yang di-assign hari ini & sesuai workzone
    const targetDateStart = new Date(targetDate + 'T00:00:00.000Z');
    const targetDateEnd = new Date(targetDate + 'T23:59:59.999Z');
    
    const workloads = await prisma.ticket.findMany({
      where: {
        teknisi_user_id: { in: teknisiHadir.map((t: { id_user: number }) => t.id_user) },
        WORKZONE: workzoneName,
        STATUS_UPDATE: { in: ['assigned', 'on_progress', 'pending'] },
        ticketTracking: {
          assigned_at: {
            gte: targetDateStart,
            lt: targetDateEnd,
          },
        },
      },
      select: {
        teknisi_user_id: true,
        id_ticket: true,
      },
    });
    
    // Count tickets per teknisi
    const loadMap = new Map<number, number>();
    for (const t of workloads) {
      if (t.teknisi_user_id !== null) {
        loadMap.set(t.teknisi_user_id, (loadMap.get(t.teknisi_user_id) || 0) + 1);
      }
    }

    // 7. Ambil teknisi yang sudah di-plot ke cluster ini hari ini
    const existingPlot = await prisma.cluster_assignment.findMany({
      where: { cluster_id: clusterId, assigned_date: targetDate, is_active: true },
      select: { teknisi_id: true },
    });
    const plottedIds = new Set(existingPlot.map((p: { teknisi_id: number }) => p.teknisi_id));

    const result = teknisiHadir.map((t: { id_user: number; nama: string | null; nik: string | null }) => ({
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
