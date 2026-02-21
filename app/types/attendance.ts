export type AttendanceStatus = 'PRESENT' | 'LATE';

export interface TechnicianAttendance {
  id: number;
  technician_id: number;
  check_in_at: string;
  check_out_at: string | null;
  date: string;
  month: number;
  year: number;
  workzone_id: number;
  status: AttendanceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TechnicianAttendanceWithDetails extends TechnicianAttendance {
  technician_name?: string;
  technician_nik?: string;
  workzone_name?: string;
}

export interface MonthlyAttendanceSummary {
  technician_id: number;
  technician_name: string;
  technician_nik: string;
  workzone: string;
  total_present: number;
  total_late: number;
  total_absent: number;
  working_days: number;
  attendance_percentage: number;
}

export interface TodayAttendanceStatus {
  checked_in: boolean;
  checked_out: boolean;
  check_in_at: string | null;
  check_out_at: string | null;
  status: AttendanceStatus | null;
}

export interface AttendanceCheckInInput {
  workzone_id: number;
}

export interface AttendanceCheckOutInput {}

export interface ManualAttendanceInput {
  technician_id: number;
  date: string;
  check_in_at: string;
  check_out_at?: string;
  workzone_id: number;
  status: AttendanceStatus;
  notes?: string;
}

export interface AttendanceQueryParams {
  month?: number;
  year?: number;
  technician_id?: number;
}

export interface AttendanceListResponse {
  success: boolean;
  data?: {
    records: TechnicianAttendanceWithDetails[];
    summary: {
      total_present: number;
      total_late: number;
      total_absent: number;
      working_days: number;
    };
  };
  message?: string;
}

export interface TodayPresentResponse {
  success: boolean;
  data?: {
    present_technician_ids: number[];
    present_count: number;
  };
  message?: string;
}

export interface OwnStatusResponse {
  success: boolean;
  data?: TodayAttendanceStatus;
  message?: string;
}

export interface CheckInResponse {
  success: boolean;
  data?: {
    check_in_at: string;
    status: AttendanceStatus;
  };
  message?: string;
}

export interface CheckOutResponse {
  success: boolean;
  data?: {
    check_out_at: string;
  };
  message?: string;
}
