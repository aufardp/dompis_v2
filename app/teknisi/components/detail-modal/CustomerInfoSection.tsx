import { Ticket } from '@/app/types/ticket';
import { formatDateTimeWIB } from '@/app/utils/datetime';
import { AlertTriangle, User } from 'lucide-react';
import SectionCard from './SectionCard';
import InfoField from './InfoField';
import AddressEditor from './AddressEditor';

interface CustomerInfoSectionProps {
  ticket: Ticket;
  ticketAge: string;
  addressSectionRef: React.RefObject<HTMLDivElement | null>;
  canUpdateAlamat: boolean;
  isAlamatEmpty: boolean;
  isOnProgress: boolean;
  onError: (err: string | null) => void;
  onAddressSaved: (address: string) => void;
}

export default function CustomerInfoSection({
  ticket,
  ticketAge,
  addressSectionRef,
  canUpdateAlamat,
  isAlamatEmpty,
  isOnProgress,
  onError,
  onAddressSaved,
}: CustomerInfoSectionProps) {
  return (
    <SectionCard title='Informasi Pelanggan' icon={User} iconBgColor='blue'>
      <div className='space-y-3'>
        <InfoField
          className='uppercase'
          label='Nama'
          value={ticket.contactName}
        />
        <InfoField
          label='Telepon'
          value={ticket.contactPhone}
          variant='phone'
        />
        <InfoField label='No. Service' value={ticket.serviceNo} />
        <InfoField
          label='Tgl. Laporan'
          value={
            ticket.reportedDate
              ? formatDateTimeWIB(ticket.reportedDate)
              : '-'
          }
        />
        <InfoField label='Umur Ticket' value={ticketAge} />

        <div
          ref={addressSectionRef}
          id='address-editor-section'
          className='border-t border-slate-100 pt-2 dark:border-slate-800'
        >
          <p className='mb-2 text-[10px] font-bold tracking-wide text-slate-400 uppercase dark:text-slate-500'>
            Alamat (Pastikan Valid)
            {isOnProgress && isAlamatEmpty && (
              <span className='ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400'>
                <AlertTriangle size={10} className='mr-1 inline' />
                WAJIB
              </span>
            )}
          </p>
          <AddressEditor
            ticketId={ticket.idTicket}
            initialAddress={ticket.alamat}
            canEdit={canUpdateAlamat}
            onError={onError}
            onAddressSaved={onAddressSaved}
          />
        </div>
      </div>
    </SectionCard>
  );
}
