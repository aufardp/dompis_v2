'use client';

import { Ticket } from '@/app/types/ticket';
import { B2B_GROUPS, getB2BGroupKey } from '@/app/config/b2b-groups';
import B2BGroupCard from './B2BGroupCard';
import B2BGroupSummary from './B2BGroupSummary';

interface B2BGroupedTicket {
  groupKey: string;
  tickets: Ticket[];
}

interface B2BSectionProps {
  groupedData: B2BGroupedTicket[];
  groupSummaries?: Record<
    string,
    {
      total: number;
      open: number;
      assigned: number;
      close: number;
      ffgCount?: number;
      gamasCount?: number;
      p1Count?: number;
      pPlusCount?: number;
    }
  >;
  summary: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    regulerCount: number;
    sqmCount: number;
    ffgCount: number;
    gamasCount: number;
    p1Count: number;
    pPlusCount: number;
  };
}

export default function B2BSection({
  groupedData,
  groupSummaries,
  summary,
}: B2BSectionProps) {
  const groupMap = new Map<string, Ticket[]>();
  for (const group of groupedData) {
    groupMap.set(group.groupKey, group.tickets);
  }

  const activeGroupCount = B2B_GROUPS.filter((g) => {
    const summaryTotal = groupSummaries?.[g.key]?.total;
    return summaryTotal !== undefined
      ? summaryTotal > 0
      : (groupMap.get(g.key)?.length ?? 0) > 0;
  }).length;

  return (
    <div className='space-y-6 md:space-y-8'>
      {/* Section header / Summary Banner */}
      <B2BGroupSummary
        title='B2B'
        total={summary.total}
        open={summary.open}
        assigned={summary.assigned}
        close={summary.close}
        regulerCount={summary.regulerCount}
        sqmCount={summary.sqmCount}
        ffgCount={summary.ffgCount}
        gamasCount={summary.gamasCount}
        p1Count={summary.p1Count}
        pPlusCount={summary.pPlusCount}
        activeGroupCount={activeGroupCount}
      />

      {/* Grouped card grid */}
      <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
        {B2B_GROUPS.map((group) => {
          const tickets = groupMap.get(group.key) ?? [];
          return (
            <B2BGroupCard
              key={group.key}
              groupKey={group.key}
              label={group.label}
              icon={group.icon}
              tickets={tickets}
              summary={groupSummaries?.[group.key]}
            />
          );
        })}
      </div>
    </div>
  );
}
