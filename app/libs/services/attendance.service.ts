import prisma from '@/app/libs/prisma';
import {
  Prisma,
  AttendanceStatus as PrismaAttendanceStatus,
} from '@prisma/client';
import {
  format,
  getDaysInMonth,
  isWeekend,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { toWIB, toUTC, WIB_TIMEZONE } from '@/app/utils/datetime';
import {
  AttendanceStatus,
  TechnicianAttendance,
  TechnicianAttendanceWithDetails,
  MonthlyAttendanceSummary,
  TodayAttendanceStatus,
  ManualAttendanceInput,
} from '@/app/types/attendance';

const CHECK_IN_CUTOFF_HOUR = 8;
const CHECK_IN_CUTOFF_MINUTE = 0;

export class AttendanceService {
  static computeStatus(checkInTime: Date): PrismaAttendanceStatus {
    const checkInWIB = toWIB(checkInTime);
    const cutoffTime = new Date(checkInWIB);
    cutoffTime.setHours(CHECK_IN_CUTOFF_HOUR, CHECK_IN_CUTOFF_MINUTE, 0, 0);

    return checkInWIB <= cutoffTime
      ? PrismaAttendanceStatus.PRESENT
      : PrismaAttendanceStatus.LATE;
  }

  static getTodayDateString(): string {
    return format(toWIB(new Date()), 'yyyy-MM-dd');
  }

  static getTodayMonth(): number {
    return toWIB(new Date()).getMonth() + 1;
  }

  static getTodayYear(): number {
    return toWIB(new Date()).getFullYear();
  }

  static async checkIn(
    technicianId: number,
    workzoneId: number,
  ): Promise<{
    success: boolean;
    check_in_at?: string;
    status?: AttendanceStatus;
    message?: string;
  }> {
    const today = this.getTodayDateString();
    const month = this.getTodayMonth();
    const year = this.getTodayYear();
    const now = new Date();

    const existingAttendance = await prisma.technician_attendance.findFirst({
      where: {
        technician_id: technicianId,
        date: today,
      },
    });

    if (existingAttendance) {
      return {
        success: false,
        message: 'Anda sudah absen hari ini',
      };
    }

    const status = this.computeStatus(now);

    const attendance = await prisma.technician_attendance.create({
      data: {
        technician_id: technicianId,
        workzone_id: workzoneId,
        check_in_at: now,
        date: today,
        month,
        year,
        status,
      },
    });

    return {
      success: true,
      check_in_at: attendance.check_in_at.toISOString(),
      status: attendance.status as AttendanceStatus,
    };
  }

  static async checkOut(technicianId: number): Promise<{
    success: boolean;
    check_out_at?: string;
    message?: string;
  }> {
    const today = this.getTodayDateString();
    const now = new Date();

    const existingAttendance = await prisma.technician_attendance.findFirst({
      where: {
        technician_id: technicianId,
        date: today,
      },
    });

    if (!existingAttendance) {
      return {
        success: false,
        message: 'Anda belum absen hari ini',
      };
    }

    if (existingAttendance.check_out_at) {
      return {
        success: false,
        message: 'Anda sudah absen keluar hari ini',
      };
    }

    await prisma.technician_attendance.update({
      where: { id: existingAttendance.id },
      data: {
        check_out_at: now,
      },
    });

    return {
      success: true,
      check_out_at: now.toISOString(),
    };
  }

  static async getOwnStatus(
    technicianId: number,
  ): Promise<TodayAttendanceStatus> {
    const today = this.getTodayDateString();

    const attendance = await prisma.technician_attendance.findFirst({
      where: {
        technician_id: technicianId,
        date: today,
      },
    });

    if (!attendance) {
      return {
        checked_in: false,
        checked_out: false,
        check_in_at: null,
        check_out_at: null,
        status: null,
      };
    }

    return {
      checked_in: true,
      checked_out: attendance.check_out_at !== null,
      check_in_at: attendance.check_in_at.toISOString(),
      check_out_at: attendance.check_out_at?.toISOString() || null,
      status: attendance.status as AttendanceStatus,
    };
  }

  static async getTodayPresentTechnicianIds(): Promise<number[]> {
    const today = this.getTodayDateString();

    const attendances = await prisma.technician_attendance.findMany({
      where: {
        date: today,
      },
      select: {
        technician_id: true,
      },
    });

    return attendances.map((a) => a.technician_id);
  }

  static async getMonthlyAttendance(
    month: number,
    year: number,
    technicianIds?: number[],
  ): Promise<{
    records: TechnicianAttendanceWithDetails[];
    summary: {
      total_present: number;
      total_late: number;
      total_absent: number;
      working_days: number;
    };
  }> {
    const workingDays = this.getWorkingDaysInMonth(month, year);

    const whereClause: Record<string, unknown> = {
      month,
      year,
    };

    if (technicianIds && technicianIds.length > 0) {
      whereClause.technician_id = { in: technicianIds };
    }

    const records = await prisma.technician_attendance.findMany({
      where: whereClause,
      include: {
        technician: {
          select: {
            id_user: true,
            nama: true,
            nik: true,
          },
        },
        workzone: {
          select: {
            id_sa: true,
            nama_sa: true,
          },
        },
      },
      orderBy: [{ date: 'desc' }, { check_in_at: 'desc' }],
    });

    const mappedRecords: TechnicianAttendanceWithDetails[] = records.map(
      (r) => ({
        id: r.id,
        technician_id: r.technician_id,
        check_in_at: r.check_in_at.toISOString(),
        check_out_at: r.check_out_at?.toISOString() || null,
        date: r.date,
        month: r.month,
        year: r.year,
        workzone_id: r.workzone_id,
        status: r.status as AttendanceStatus,
        notes: r.notes,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
        technician_name: r.technician.nama || undefined,
        technician_nik: r.technician.nik || undefined,
        workzone_name: r.workzone.nama_sa || undefined,
      }),
    );

    const totalPresent = records.filter((r) => r.status === 'PRESENT').length;
    const totalLate = records.filter((r) => r.status === 'LATE').length;

    return {
      records: mappedRecords,
      summary: {
        total_present: totalPresent,
        total_late: totalLate,
        total_absent: 0,
        working_days: workingDays,
      },
    };
  }

  static async getMonthlySummary(
    month: number,
    year: number,
    technicianIds: number[],
  ): Promise<MonthlyAttendanceSummary[]> {
    const workingDays = this.getWorkingDaysInMonth(month, year);

    const records = await prisma.technician_attendance.findMany({
      where: {
        month,
        year,
        technician_id: { in: technicianIds },
      },
      include: {
        technician: {
          select: {
            id_user: true,
            nama: true,
            nik: true,
          },
        },
        workzone: {
          select: {
            nama_sa: true,
          },
        },
      },
    });

    const techniciansMap = new Map<
      number,
      {
        id_user: number;
        nama: string | null;
        nik: string | null;
        workzone: string;
        present: number;
        late: number;
      }
    >();

    for (const techId of technicianIds) {
      const tech = records.find((r) => r.technician_id === techId)?.technician;
      const workzone =
        records.find((r) => r.technician_id === techId)?.workzone.nama_sa ||
        'Unknown';

      techniciansMap.set(techId, {
        id_user: techId,
        nama: tech?.nama || null,
        nik: tech?.nik || null,
        workzone,
        present: 0,
        late: 0,
      });
    }

    for (const record of records) {
      const tech = techniciansMap.get(record.technician_id);
      if (tech) {
        if (record.status === 'PRESENT') {
          tech.present += 1;
        } else if (record.status === 'LATE') {
          tech.late += 1;
        }
      }
    }

    const summaries: MonthlyAttendanceSummary[] = [];
    techniciansMap.forEach((tech) => {
      const totalPresent = tech.present;
      const totalLate = tech.late;
      const totalAbsent = Math.max(0, workingDays - totalPresent - totalLate);
      const attendancePercentage =
        workingDays > 0 ? ((totalPresent + totalLate) / workingDays) * 100 : 0;

      summaries.push({
        technician_id: tech.id_user,
        technician_name: tech.nama || 'Unknown',
        technician_nik: tech.nik || '',
        workzone: tech.workzone,
        total_present: totalPresent,
        total_late: totalLate,
        total_absent: totalAbsent,
        working_days: workingDays,
        attendance_percentage: Math.round(attendancePercentage * 10) / 10,
      });
    });

    return summaries.sort(
      (a, b) => b.attendance_percentage - a.attendance_percentage,
    );
  }

  static async getTechnicianAttendanceDetail(
    technicianId: number,
    month: number,
    year: number,
  ): Promise<TechnicianAttendanceWithDetails[]> {
    const records = await prisma.technician_attendance.findMany({
      where: {
        technician_id: technicianId,
        month,
        year,
      },
      include: {
        technician: {
          select: {
            id_user: true,
            nama: true,
            nik: true,
          },
        },
        workzone: {
          select: {
            id_sa: true,
            nama_sa: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    return records.map((r) => ({
      id: r.id,
      technician_id: r.technician_id,
      check_in_at: r.check_in_at.toISOString(),
      check_out_at: r.check_out_at?.toISOString() || null,
      date: r.date,
      month: r.month,
      year: r.year,
      workzone_id: r.workzone_id,
      status: r.status as AttendanceStatus,
      notes: r.notes,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      technician_name: r.technician.nama || undefined,
      technician_nik: r.technician.nik || undefined,
      workzone_name: r.workzone.nama_sa || undefined,
    }));
  }

  static async createManualAttendance(data: ManualAttendanceInput): Promise<{
    success: boolean;
    message?: string;
  }> {
    const [day, monthStr, yearStr] = data.date.split('-');
    const month = parseInt(monthStr);
    const year = parseInt(yearStr);

    const existingAttendance = await prisma.technician_attendance.findFirst({
      where: {
        technician_id: data.technician_id,
        date: data.date,
      },
    });

    if (existingAttendance) {
      await prisma.technician_attendance.update({
        where: { id: existingAttendance.id },
        data: {
          check_in_at: new Date(data.check_in_at),
          check_out_at: data.check_out_at ? new Date(data.check_out_at) : null,
          workzone_id: data.workzone_id,
          status: data.status,
          notes: data.notes || null,
        },
      });

      return {
        success: true,
        message: 'Absensi berhasil diperbarui',
      };
    }

    await prisma.technician_attendance.create({
      data: {
        technician_id: data.technician_id,
        workzone_id: data.workzone_id,
        check_in_at: new Date(data.check_in_at),
        check_out_at: data.check_out_at ? new Date(data.check_out_at) : null,
        date: data.date,
        month,
        year,
        status: data.status,
        notes: data.notes || null,
      },
    });

    return {
      success: true,
      message: 'Absensi manual berhasil ditambahkan',
    };
  }

  static getWorkingDaysInMonth(month: number, year: number): number {
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(new Date(year, month - 1));

    let workingDays = 0;
    let current = start;

    while (current <= end) {
      if (!isWeekend(current)) {
        workingDays += 1;
      }
      current = new Date(current.setDate(current.getDate() + 1));
    }

    return workingDays;
  }

  static getMonthCalendarData(
    month: number,
    year: number,
    attendanceMap: Map<string, TechnicianAttendance>,
  ): {
    date: string;
    status: AttendanceStatus | 'WEEKEND' | 'FUTURE' | 'NO_RECORD';
    check_in_at?: string;
  }[][] {
    const daysInMonth = getDaysInMonth(new Date(year, month - 1));
    const today = this.getTodayDateString();
    const currentMonth = this.getTodayMonth();
    const currentYear = this.getTodayYear();

    const weeks: {
      date: string;
      status: AttendanceStatus | 'WEEKEND' | 'FUTURE' | 'NO_RECORD';
      check_in_at?: string;
    }[][] = [];

    const firstDayOfMonth = new Date(year, month - 1, 1);
    const startDayOfWeek = firstDayOfMonth.getDay();

    let currentWeek: {
      date: string;
      status: AttendanceStatus | 'WEEKEND' | 'FUTURE' | 'NO_RECORD';
      check_in_at?: string;
    }[] = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      currentWeek.push({
        date: '',
        status: 'NO_RECORD',
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(year, month - 1, day);
      const isWeekendDay = isWeekend(dateObj);
      const isFuture =
        year > currentYear ||
        (year === currentYear && month > currentMonth) ||
        (year === currentYear &&
          month === currentMonth &&
          day > parseInt(today.split('-')[2]));

      let status: AttendanceStatus | 'WEEKEND' | 'FUTURE' | 'NO_RECORD' =
        'NO_RECORD';
      let check_in_at: string | undefined;

      if (isFuture) {
        status = 'FUTURE';
      } else if (isWeekendDay) {
        status = 'WEEKEND';
      } else {
        const attendance = attendanceMap.get(date);
        if (attendance) {
          status = attendance.status;
          check_in_at = attendance.check_in_at;
        }
      }

      currentWeek.push({
        date,
        status,
        check_in_at,
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({
          date: '',
          status: 'NO_RECORD',
        });
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }
}
