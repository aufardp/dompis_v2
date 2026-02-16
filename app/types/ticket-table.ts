import { Ticket } from './ticket';

export interface TicketTableProps {
  tickets?: Ticket[];
  loading?: boolean;
  onAssign: (ticketId: string) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}
