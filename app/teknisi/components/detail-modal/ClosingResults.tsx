import { Ticket } from '@/app/types/ticket';
import { CheckCircle2 } from 'lucide-react';
import SectionCard from './SectionCard';
import InfoField from './InfoField';

interface ClosingResultsProps {
  ticket: Ticket;
  isClosed: boolean;
}

export default function ClosingResults({
  ticket,
  isClosed,
}: ClosingResultsProps) {
  if (!isClosed) return null;

  return (
    <SectionCard title='Closing Results' icon={CheckCircle2} iconBgColor='green'>
      <div className='space-y-3'>
        <InfoField label='RCA' value={ticket.rca} />
        <InfoField label='Sub RCA' value={ticket.subRca} />

        {ticket.descriptionSolutionDompis && (
          <div className='border-t border-slate-100 pt-3 dark:border-slate-800'>
            <p className='mb-1.5 text-[10px] font-bold tracking-wide text-slate-400 uppercase dark:text-slate-500'>
              Detail Perbaikan
            </p>
            <div className='rounded-xl border border-green-100 bg-green-50/60 px-3.5 py-3 dark:border-green-500/20 dark:bg-green-500/10'>
              <p className='text-sm leading-relaxed font-medium whitespace-pre-wrap text-slate-700 dark:text-slate-200'>
                {ticket.descriptionSolutionDompis}
              </p>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
