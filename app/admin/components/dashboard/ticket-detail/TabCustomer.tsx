'use client';

import { User, UserCircle, MapPin, Phone } from 'lucide-react';
import { CustomerType } from '@/app/types/ticket';
import { normalizeCustomerType } from '@/app/config/customer-types';
import type { TicketDetail } from './types';
import { Field, Section } from './FieldSection';

interface TabCustomerProps {
  ticket: TicketDetail;
}

export function TabCustomer({ ticket }: TabCustomerProps) {
  return (
    <>
      <Section icon={<User size={14} />} title='Kontak Pelanggan' fullWidth>
        <div className='col-span-2'>
          <Field label='Contact Name' value={ticket.contactName} fullWidth />
        </div>
        {ticket.customerName && ticket.customerName !== ticket.contactName && (
          <div className='col-span-2'>
            <Field label='Customer Name' value={ticket.customerName} fullWidth />
          </div>
        )}
        <Field label='Service No' value={ticket.serviceNo} mono />
        <Field label='Contact Phone' value={ticket.contactPhone} mono />
        {ticket.contactPhone && (
          <div className='col-span-2 mt-1 flex flex-wrap gap-2'>
            <a
              href={`tel:${ticket.contactPhone}`}
              className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            >
              <Phone size={14} />
              Call
            </a>
          </div>
        )}
      </Section>

      <Section icon={<UserCircle size={14} />} title='Segmentasi'>
        {ticket.customerType && (() => {
          const resolvedCtype = ticket.ctype
            ? ticket.ctype
            : normalizeCustomerType(ticket.customerType);
          const config = resolvedCtype ? CustomerType[resolvedCtype] : null;
          const Icon = config?.icon;
          return (
            <div className='col-span-2'>
              <div className='mb-1.5 text-[10px] font-medium text-slate-500 uppercase dark:text-slate-400'>
                Tipe Pelanggan
              </div>
              {config ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.color}`}>
                  {Icon && <Icon size={12} />}
                  <span>{config.label}</span>
                </span>
              ) : (
                <span className='inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300'>
                  {ticket.customerType}
                </span>
              )}
            </div>
          );
        })()}
        <Field label='Customer Segment' value={ticket.customerSegment} />
        <Field label='Service Type' value={ticket.serviceType} />
        <Field label='Incident Domain' value={ticket.incidentDomain} />
      </Section>

      {(ticket.alamat || ticket.workzone || ticket.witel) && (
        <Section icon={<MapPin size={14} />} title='Lokasi' fullWidth>
          <div className='col-span-2'>
            <Field label='Alamat' value={ticket.alamat} fullWidth />
          </div>
          <div className='col-span-2'>
            <Field label='Workzone' value={ticket.workzone} fullWidth />
          </div>
          <Field label='Witel' value={ticket.witel} />
        </Section>
      )}
    </>
  );
}
