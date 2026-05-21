import DurationTable from './DurationTable';

interface SASummary { name: string; counts: number[]; }
interface PanelArea { name: string; region: string; sas: SASummary[]; }

interface PanelData {
  type: string;
  label: string;
  buckets: string[];
  areas: PanelArea[];
  totals: number[];
  grandTotal?: number;
}

interface TicketDurationPanelProps {
  panel: PanelData;
}

export default function TicketDurationPanel({ panel }: TicketDurationPanelProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="sticky top-0 z-10 bg-gray-900 px-3 py-2 dark:bg-gray-950">
        <h2 className="text-sm font-bold text-white">DURASI TIKET {panel.label}</h2>
      </div>
      <DurationTable areas={panel.areas} totals={panel.totals} buckets={panel.buckets} showTotal={panel.grandTotal !== undefined} />
    </div>
  );
}
