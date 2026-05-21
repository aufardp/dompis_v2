'use client';

import OperationalFilterBar from './OperationalFilterBar';

interface FilterBarB2CProps {
  ticketType?: string[];
  statusUpdate?: string[];
  flagging?: string[];
  onTypeChange?: (types: string[]) => void;
  onStatusChange?: (statuses: string[]) => void;
  onFlaggingChange?: (flags: string[]) => void;
}

export function FilterBarB2C(props: FilterBarB2CProps) {
  return <OperationalFilterBar segment='b2c' {...props} />;
}
