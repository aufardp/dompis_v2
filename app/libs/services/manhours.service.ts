/**
 * ManHours Service
 * 
 * Calculates technician productivity based on:
 * - REALISASI: Sum of (ticket_count_per_category × manhours_per_category)
 * - JAM_EFEKTIF: Sum of working_hours from technician_attendance
 * - PRODUKTIVITAS: REALISASI ÷ JAM_EFEKTIF
 * - TARGET: 176 hours (22 days × 8 hours)
 */

import prisma from '@/app/libs/prisma';
import { toWIB } from '@/app/utils/datetime';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';

/**
 * Standard manhour values per ticket category
 * These values are also stored in manhours_config table for database reference
 */
export const MANHOUR_VALUES: Record<string, number> = {
  reguler: 2.0,
  sqm: 2.0,
  unspec: 2.0,
  datin: 2.0,
  'non-datin': 2.0,
  exbis: 2.0,
  infracare: 2.0,
  'tangible-odp': 4.0,
  psb: 5.3,
  'psb-b2b': 5.3,
  'tangible-odc': 8.0,
} as const;

/**
 * Maps raw database JENIS_TIKET values to canonical keys (case-insensitive)
 */
export const JENIS_TIKET_DB_MAP: Record<string, string> = {
  reguler: 'reguler',
  REGULER: 'reguler',
  Reguler: 'reguler',
  regular: 'reguler',
  Regular: 'reguler',
  REGULAR: 'reguler',
  sqm: 'sqm',
  SQM: 'sqm',
  Sqm: 'sqm',
  unspec: 'unspec',
  UNSPEC: 'unspec',
  Unspec: 'unspec',
  datin: 'datin',
  DATIN: 'datin',
  Datin: 'datin',
  'non-datin': 'non-datin',
  'NON-DATIN': 'non-datin',
  'Non-Datin': 'non-datin',
  exbis: 'exbis',
  EXBIS: 'exbis',
  Exbis: 'exbis',
  infracare: 'infracare',
  INFRACARE: 'infracare',
  Infracare: 'infracare',
  'tangible-odp': 'tangible-odp',
  'TANGIBLE-ODP': 'tangible-odp',
  'Tangible-ODP': 'tangible-odp',
  'tangible-odc': 'tangible-odc',
  'TANGIBLE-ODC': 'tangible-odc',
  'Tangible-ODC': 'tangible-odc',
  psb: 'psb',
  PSB: 'psb',
  Psb: 'psb',
  'psb-b2b': 'psb-b2b',
  'PSB-B2B': 'psb-b2b',
  'Psb-B2B': 'psb-b2b',
} as const;

/**
 * Normalize raw JENIS_TIKET value to canonical key
 */
export function normalizeJenisKey(rawValue: string | null): string | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  return JENIS_TIKET_DB_MAP[trimmed] || trimmed.toLowerCase();
}

/**
 * Filter parameters for manhours calculation
 */
export interface ManhoursFilter {
  dateFrom: Date;
  dateTo: Date;
  sto?: string;
  name?: string;
  technicianIds?: number[];
}

/**
 * Single row result for manhours calculation
 */
export interface ManhoursRow {
  technician_id: number;
  nama: string | null;
  nik: string | null;
  sto: string;
  // Dynamic category counts (will be populated based on configs)
  categories: Record<string, number>;
  total_tickets: number;
  realisasi: number;
  jam_efektif: number;
  produktivitas: number;
  target: number;
}

/**
 * Manhour configuration from database
 */
export interface ManhourConfig {
  jenis_key: string;
  label: string;
  manhours: number;
  is_active: boolean;
  sort_order: number;
}

/**
 * In-memory cache for manhour configs (10 minutes TTL)
 */
let configCache: {
  configs: ManhourConfig[];
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get manhour configurations from database with caching
 */
export async function getManhourConfigs(): Promise<ManhourConfig[]> {
  const now = Date.now();
  
  // Return cached if still valid
  if (configCache && (now - configCache.timestamp) < CACHE_TTL_MS) {
    return configCache.configs;
  }

  // Fetch from database
  const configs = await prisma.manhours_config.findMany({
    where: { is_active: true },
    orderBy: { sort_order: 'asc' },
  });

  // Update cache
  configCache = {
    configs: configs.map((c) => ({
      jenis_key: c.jenis_key,
      label: c.label,
      manhours: Number(c.manhours),
      is_active: c.is_active,
      sort_order: c.sort_order,
    })),
    timestamp: now,
  };

  return configCache.configs;
}

/**
 * Invalidate the config cache (call this after updating manhours_config table)
 */
export function invalidateConfigCache(): void {
  configCache = null;
}

/**
 * Build config map for quick lookup
 */
function buildConfigMap(configs: ManhourConfig[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const config of configs) {
    map[config.jenis_key] = config.manhours;
  }
  return map;
}

/**
 * Calculate manhours for technicians based on filter
 * 
 * Formula:
 * REALISASI = Σ (jumlah_tiket_per_kategori × manhours_per_kategori)
 * JAM_EFEKTIF = Σ working_hours from technician_attendance in date range
 * PRODUKTIVITAS = REALISASI ÷ JAM_EFEKTIF
 * TARGET = 176 (constant)
 */
export async function calculateManhours(
  filter: ManhoursFilter,
  adminWorkzones?: string[],
): Promise<ManhoursRow[]> {
  const { dateFrom, dateTo, sto, name, technicianIds } = filter;

  // Get active manhour configs
  const configs = await getManhourConfigs();
  const configMap = buildConfigMap(configs);

  // Convert dates to WIB
  const dateFromWIB = toWIB(dateFrom);
  const dateToWIB = toWIB(dateTo);

  // Build technician filter
  const technicianWhere: Record<string, unknown> = {
    role_id: 4, // teknisi role
  };

  // Filter by specific technician IDs if provided
  if (technicianIds && technicianIds.length > 0) {
    technicianWhere.id_user = { in: technicianIds };
  }

  // Get all technicians first
  const technicians = await prisma.users.findMany({
    where: technicianWhere,
    include: {
      user_sa: {
        include: {
          service_area: true,
        },
      },
    },
  });

  // Filter technicians by workzone (admin's service area)
  let filteredTechnicians = technicians;
  if (adminWorkzones && adminWorkzones.length > 0) {
    filteredTechnicians = technicians.filter((tech) => {
      const techWorkzones = tech.user_sa
        .map((usa) => usa.service_area?.nama_sa)
        .filter((n): n is string => !!n);
      
      // Check if any of technician's workzones match admin's workzones
      return techWorkzones.some((wz) => adminWorkzones.includes(wz));
    });
  }

  // Further filter by STO if specified
  if (sto) {
    filteredTechnicians = filteredTechnicians.filter((tech) => {
      const techWorkzones = tech.user_sa
        .map((usa) => usa.service_area?.nama_sa)
        .filter((n): n is string => !!n);
      return techWorkzones.includes(sto);
    });
  }

  // Filter by name if specified
  if (name) {
    const searchLower = name.toLowerCase();
    filteredTechnicians = filteredTechnicians.filter(
      (tech) =>
        tech.nama?.toLowerCase().includes(searchLower) ||
        tech.nik?.toLowerCase().includes(searchLower),
    );
  }

  if (filteredTechnicians.length === 0) {
    return [];
  }

  const technicianIdsList = filteredTechnicians.map((t) => t.id_user);

  // Get closed tickets in date range grouped by technician and jenis
  const tickets = await prisma.ticket.findMany({
    where: {
      teknisi_user_id: { in: technicianIdsList },
      closed_at: {
        gte: dateFromWIB,
        lte: dateToWIB,
      },
      JENIS_TIKET: { not: null },
    },
    select: {
      teknisi_user_id: true,
      JENIS_TIKET: true,
    },
  });

  // Get effective hours (working_hours) from attendance in date range
  const attendanceRecords = await prisma.technician_attendance.findMany({
    where: {
      technician_id: { in: technicianIdsList },
      check_in_at: {
        gte: dateFromWIB,
        lte: dateToWIB,
      },
    },
    select: {
      technician_id: true,
      working_hours: true,
      check_in_at: true,
      check_out_at: true,
    },
  });

  // Aggregate tickets per technician per category
  const ticketCounts: Record<
    number,
    Record<string, number>
  > = {};

  for (const ticket of tickets) {
    const techId = ticket.teknisi_user_id!;
    const jenisKey = normalizeJenisKey(ticket.JENIS_TIKET);

    if (!jenisKey) continue;

    if (!ticketCounts[techId]) {
      ticketCounts[techId] = {};
    }

    // Only count if this jenis_key is in our active configs
    if (configMap[jenisKey] !== undefined) {
      ticketCounts[techId][jenisKey] = (ticketCounts[techId][jenisKey] || 0) + 1;
    }
  }

  // Aggregate working hours per technician
  const workingHoursMap: Record<number, number> = {};

  for (const record of attendanceRecords) {
    const techId = record.technician_id;
    
    // Use working_hours if available, otherwise calculate from timestamps
    let hours = record.working_hours ? Number(record.working_hours) : 0;
    
    if (hours === 0 && record.check_out_at && record.check_in_at) {
      const diffMs = record.check_out_at.getTime() - record.check_in_at.getTime();
      hours = Math.round((diffMs / 3600000) * 100) / 100;
    }

    workingHoursMap[techId] = (workingHoursMap[techId] || 0) + hours;
  }

  // Build result rows
  const results: ManhoursRow[] = [];

  for (const tech of filteredTechnicians) {
    const techId = tech.id_user;
    const categories = ticketCounts[techId] || {};
    const totalTickets = Object.values(categories).reduce(
      (sum, count) => sum + count,
      0,
    );

    // Calculate REALISASI
    let realisasi = 0;
    for (const [jenisKey, count] of Object.entries(categories)) {
      const manhourValue = configMap[jenisKey] || MANHOUR_VALUES[jenisKey] || 0;
      realisasi += count * manhourValue;
    }

    // Get JAM_EFEKTIF
    const jamEfektif = workingHoursMap[techId] || 0;

    // Calculate PRODUKTIVITAS
    const produktivitas = jamEfektif > 0 ? realisasi / jamEfektif : 0;

    // Get STO name
    const stoName =
      tech.user_sa.find((usa) => usa.service_area?.nama_sa)?.service_area
        ?.nama_sa || 'Unknown';

    results.push({
      technician_id: techId,
      nama: tech.nama,
      nik: tech.nik,
      sto: stoName,
      categories,
      total_tickets: totalTickets,
      realisasi: Math.round(realisasi * 100) / 100,
      jam_efektif: Math.round(jamEfektif * 100) / 100,
      produktivitas: Math.round(produktivitas * 100) / 100,
      target: 176,
    });
  }

  // Sort by PRODUKTIVITAS DESC
  results.sort((a, b) => b.produktivitas - a.produktivitas);

  return results;
}

/**
 * Get list of available STO options for filter dropdown
 */
export async function getStoOptions(
  adminWorkzones?: string[],
): Promise<{ value: string; label: string }[]> {
  let whereClause: Record<string, unknown> = {};

  // If admin has specific workzones, filter by those
  if (adminWorkzones && adminWorkzones.length > 0) {
    whereClause.nama_sa = { in: adminWorkzones };
  }

  const serviceAreas = await prisma.service_area.findMany({
    where: whereClause,
    select: { nama_sa: true },
    orderBy: { nama_sa: 'asc' },
  });

  return serviceAreas
    .filter((sa) => sa.nama_sa)
    .map((sa) => ({
      value: sa.nama_sa!,
      label: sa.nama_sa!,
    }));
}
