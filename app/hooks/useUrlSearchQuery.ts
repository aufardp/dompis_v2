'use client';

import { useEffect } from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';

type UseUrlSearchQueryOptions = {
  searchParams: ReadonlyURLSearchParams;
  onQuery: (query: string) => void;
  onClear?: () => void;
  paramName?: string;
};

export function useUrlSearchQuery({
  searchParams,
  onQuery,
  onClear,
  paramName = 'search',
}: UseUrlSearchQueryOptions) {
  useEffect(() => {
    const query = searchParams.get(paramName) || '';
    if (query) {
      onQuery(query);
      return;
    }

    onClear?.();
  }, [onClear, onQuery, paramName, searchParams]);
}
