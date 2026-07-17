'use client';

import { createContext, useContext } from 'react';

export const BucketCountContext = createContext<Record<string, number>>({});

export function useBucketCounts() {
  return useContext(BucketCountContext);
}

export const SetBucketCountContext = createContext<
  (key: string, count: number) => void
>(() => {});

export function useSetBucketCount() {
  return useContext(SetBucketCountContext);
}
