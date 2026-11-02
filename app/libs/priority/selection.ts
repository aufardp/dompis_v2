import { ApiError } from '@/app/libs/apiError';
import { BRANCH_LIST } from './constants';
import { PriorityBranchCode, TtrBucket, TtrStateFilter } from './types';
import { PrioritySelection } from './model';
import { TTR_BUCKETS } from './ttr';

export function parsePrioritySelection(params: URLSearchParams) {
  const branch = (params.get('branch') ?? 'PKL').trim().toUpperCase() as PriorityBranchCode;
  const kind = (params.get('kind') ?? '').trim() as PrioritySelection['kind'];
  const subKind = params.get('subKind')?.trim() as PrioritySelection['subKind'];
  const bucket = params.get('bucket')?.trim() as TtrBucket | undefined;
  const requestedState = (params.get('state') ?? 'all').trim();
  const state = (requestedState === 'closed' && subKind === 'close_hi' ? 'all' : requestedState) as TtrStateFilter;
  if (!BRANCH_LIST.some(item => item.code === branch)) throw new ApiError(400, 'Kode branch tidak valid.');
  if (!['all', 'reguler', 'sqm', 'underspec'].includes(kind)) throw new ApiError(400, 'Parameter kind tidak valid.');
  if (!['within', 'near', 'over', 'all'].includes(state)) throw new ApiError(400, 'Parameter state tidak valid.');
  if (bucket && !TTR_BUCKETS.includes(bucket)) throw new ApiError(400, 'Parameter bucket tidak valid.');
  if (subKind && !(kind === 'reguler' ? ['open_hi', 'close_hi'] : ['disruption', 'gaul']).includes(subKind)) throw new ApiError(400, 'Parameter subKind tidak valid.');
  if (kind !== 'reguler' && (bucket || state !== 'all')) throw new ApiError(400, 'Filter TTR hanya untuk tiket reguler.');
  return { branch, selection: { kind, subKind, bucket, state, q: (params.get('q') ?? '').trim().slice(0, 100) } };
}
