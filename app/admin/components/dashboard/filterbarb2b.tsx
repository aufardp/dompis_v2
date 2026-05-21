'use client';

import OperationalFilterBar from './OperationalFilterBar';

interface FilterBarB2BProps {
  ticketType?: string[];
  statusUpdate?: string[];
  flagging?: string[];
  onTypeChange?: (types: string[]) => void;
  onStatusChange?: (statuses: string[]) => void;
  onFlaggingChange?: (flags: string[]) => void;
}

export function FilterBarB2B(props: FilterBarB2BProps) {
  return <OperationalFilterBar segment='b2b' {...props} />;
}
