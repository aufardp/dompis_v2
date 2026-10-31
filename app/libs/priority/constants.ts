// app/libs/priority/constants.ts

export const BRANCH_LIST = [
  { code: 'PKL', name: 'PEKALONGAN', id: 10 },
  { code: 'DPS', name: 'DENPASAR', id: 1 },
  { code: 'MTR', name: 'MATARAM', id: 9 },
  { code: 'KPG', name: 'KUPANG', id: 4 },
  { code: 'FLO', name: 'FLORES', id: 2 },
] as const;

export type PriorityBranchCode = (typeof BRANCH_LIST)[number]['code'];
export type PriorityBranchId = (typeof BRANCH_LIST)[number]['id'];

export const BRANCH_CODE_TO_ID = new Map(
  BRANCH_LIST.map((b) => [b.code, b.id]),
);

export const BRANCH_ID_TO_CODE = new Map(
  BRANCH_LIST.map((b) => [b.id, b.code]),
);
