'use client';

import { Wrench, Network, Database, Gauge, AlertTriangle, FileText, UserCircle } from 'lucide-react';
import type { TicketDetail, EvidenceItem } from './types';
import { getTicketStatusRaw } from './helpers';
import { Field, Section } from './FieldSection';
import { EvidenceSection } from './EvidenceSection';

interface TabTeknisProps {
  ticket: TicketDetail;
  evidence: EvidenceItem[];
  evidenceLoading: boolean;
  onGalleryOpen: (index: number) => void;
  galleryIndex: number;
  galleryOpen: boolean;
  onGalleryClose: () => void;
}

export function TabTeknis({
  ticket,
  evidence,
  evidenceLoading,
  onGalleryOpen,
  galleryIndex,
  galleryOpen,
  onGalleryClose,
}: TabTeknisProps) {
  const statusRaw = getTicketStatusRaw(ticket);
  const isClosed = statusRaw.includes('close');
  const isPending = statusRaw.includes('pending') && !isClosed;

  return (
    <>
      <Section icon={<Wrench size={14} />} title='Perangkat & Gejala'>
        <Field label='Device Name' value={ticket.deviceName} />
        <Field label='Symptom' value={ticket.symptom} />
      </Section>

      {(ticket.snOnt || ticket.tipeOnt || ticket.onuRx || ticket.rkInformation) && (
        <Section icon={<Network size={14} />} title='Informasi Network'>
          <Field label='SN ONT' value={ticket.snOnt} mono />
          <Field label='Tipe ONT' value={ticket.tipeOnt} />
          <Field label='RX Power ONT' value={ticket.onuRx} mono />
          <Field label='RK Information' value={ticket.rkInformation} />
        </Section>
      )}

      {(ticket.lapul || ticket.gaul) && (
        <Section icon={<Database size={14} />} title='Data Tambahan'>
          <Field label='Lapul' value={ticket.lapul} />
          <Field label='Gaul' value={ticket.gaul} />
        </Section>
      )}

      {(ticket.tscResult || ticket.sccResult) && (
        <Section icon={<Gauge size={14} />} title='Hasil Testing'>
          <Field label='TSC Result' value={ticket.tscResult} />
          <Field label='SCC Result' value={ticket.sccResult} />
        </Section>
      )}

      <Section icon={<AlertTriangle size={14} />} title='Root Cause Analysis' fullWidth>
        <div className='col-span-2'>
          <Field label='RCA' value={ticket.rca} fullWidth />
        </div>
        <div className='col-span-2'>
          <Field label='Sub RCA' value={ticket.subRca} fullWidth />
        </div>
      </Section>

      {(ticket.solution ||
        ticket.descriptionActualSolution ||
        ticket.descriptionSolutionDompis ||
        ticket.sqmUpdateReason ||
        ticket.pendingDompis) && (
        <Section icon={<FileText size={14} />} title='Solution & Notes' fullWidth>
          {ticket.solution && (
            <div className='col-span-2'>
              <Field label='Solution' value={ticket.solution} fullWidth />
            </div>
          )}
          {ticket.descriptionActualSolution && (
            <div className='col-span-2'>
              <Field label='Actual Solution' value={ticket.descriptionActualSolution} fullWidth />
            </div>
          )}
          {ticket.descriptionSolutionDompis && (
            <div className='col-span-2'>
              <Field label='Solution Dompis' value={ticket.descriptionSolutionDompis} fullWidth />
            </div>
          )}
          {ticket.sqmUpdateReason && (
            <div className='col-span-2'>
              <Field label='SQM Update Reason' value={ticket.sqmUpdateReason} fullWidth />
            </div>
          )}
          {ticket.pendingDompis && (
            <div className='col-span-2'>
              <Field label='Pending Dompis' value={ticket.pendingDompis} fullWidth />
            </div>
          )}
        </Section>
      )}

      <EvidenceSection
        evidence={evidence}
        loading={evidenceLoading}
        isClosed={isClosed}
        isPending={isPending}
        onGalleryOpen={onGalleryOpen}
        galleryIndex={galleryIndex}
        galleryOpen={galleryOpen}
        onGalleryClose={onGalleryClose}
      />

      <Section icon={<UserCircle size={14} />} title='Teknisi'>
        <Field label='Technician Name' value={ticket.technicianName} />
        <Field
          label='Technician ID'
          value={ticket.teknisiUserId ? `#${ticket.teknisiUserId}` : undefined}
          mono
        />
      </Section>
    </>
  );
}
