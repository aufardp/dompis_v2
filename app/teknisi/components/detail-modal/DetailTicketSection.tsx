import { Ticket } from '@/app/types/ticket';
import SectionCard from './SectionCard';
import InfoField from './InfoField';
import DeviceEditor from './DeviceEditor';

interface DetailTicketSectionProps {
  ticket: Ticket;
  isOnProgress: boolean;
  isDeviceNameEmpty: boolean;
  canUpdateAlamat: boolean;
  isPending: boolean;
  onError: (err: string | null) => void;
  onDeviceSaved: () => void;
}

export default function DetailTicketSection({
  ticket,
  isOnProgress,
  isDeviceNameEmpty,
  canUpdateAlamat,
  isPending,
  onError,
  onDeviceSaved,
}: DetailTicketSectionProps) {
  return (
    <SectionCard title='Detail Ticket' icon='📋' iconBgColor='slate'>
      <div className='space-y-3'>
        <InfoField
          label='Jenis Pelanggan'
          value={
            ticket.customerType === 'HVC_GOLD'
              ? 'HVC Gold'
              : ticket.customerType === 'HVC_PLATINUM'
                ? 'HVC Platinum'
                : ticket.customerType === 'HVC_DIAMOND'
                  ? 'HVC Diamond'
                  : ticket.customerType === 'REGULER'
                    ? 'Reguler'
                    : ticket.customerType
          }
        />

        <InfoField label='Jenis Layanan' value={ticket.serviceType} />

        <div className='border-t border-slate-100 pt-2 dark:border-slate-800'>
          <p className='mb-2 text-[10px] font-bold tracking-wide text-slate-400 uppercase dark:text-slate-500'>
            Device Name (Pastikan Valid)
            {isOnProgress && isDeviceNameEmpty && (
              <span className='ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black text-red-600 dark:bg-red-500/10 dark:text-red-400'>
                ⚠ WAJIB
              </span>
            )}
          </p>
          <DeviceEditor
            ticketId={ticket.idTicket}
            initialDevice={ticket.deviceName}
            canEdit={canUpdateAlamat}
            onError={onError}
            onDeviceSaved={onDeviceSaved}
          />
        </div>
        <InfoField label='Workzone' value={ticket.workzone} />

        {ticket.symptom && (
          <InfoField
            label='Gejala / Symptom'
            value={ticket.symptom}
          />
        )}

        {isPending && ticket.pendingDompis && (
          <div className='rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5 dark:border-purple-500/20 dark:bg-purple-500/10'>
            <p className='mb-1 text-[10px] font-bold tracking-wide text-purple-400 uppercase'>
              Alasan Pending
            </p>
            <p className='text-sm font-semibold text-purple-900 dark:text-purple-300'>
              {ticket.pendingDompis}
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
