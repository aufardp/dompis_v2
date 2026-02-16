export interface Teknisi {
  id_user: string;
  nama: string;
  nik: string;
  serviceArea: number;
  status: 'idle' | 'assigned';
  assignedTicketsCount: number;
  currentTickets: string[];
}
