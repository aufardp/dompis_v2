'use client';

import { useState } from 'react';
import { useAssuranceGuarantee } from '@/app/hooks/useTtrComplianceOverview';
import AssuranceGuaranteeTicketsModal, {
  type AssuranceGuaranteeSpec,
} from './AssuranceGuaranteeTicketsModal';

const TIER_LABELS: Record<'diamond' | 'platinum' | 'gold' | 'reguler', string> =
  {
    diamond: 'HVC Diamond',
    platinum: 'HVC Platinum',
    gold: 'HVC Gold',
    reguler: 'Reguler',
  };

const clickableCls =
  'cursor-pointer rounded-lg transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-100';

export default function AssuranceGuaranteeCard({
  workzone,
  branch,
}: {
  workzone?: string;
  branch?: string;
}) {
  const { data, isLoading } = useAssuranceGuarantee({ workzone, branch });
  const [spec, setSpec] = useState<AssuranceGuaranteeSpec | null>(null);

  return (
    <div className='rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
            Assurance Guarantee
          </p>
          <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
            Gangguan Berulang (Pengamatan dalam 60 hari)
          </p>
        </div>
        <button
          type='button'
          disabled={isLoading}
          onClick={() =>
            setSpec({ key: 'all:all', tier: 'all', gamas: 'all', label: 'Semua Tiket Berulang' })
          }
          className={`rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-1.5 text-right ${clickableCls}`}
        >
          <p className='text-[9px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
            Total Ggn Berulang
          </p>
          <p className='text-lg leading-none font-semibold text-(--text-primary)'>
            {isLoading ? '...' : (data?.total ?? 0).toLocaleString('id-ID')}
          </p>
        </button>
      </div>

      <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
        {(Object.keys(TIER_LABELS) as (keyof typeof TIER_LABELS)[]).map(
          (tier) => {
            const t = data?.tiers[tier];
            return (
              <div
                key={tier}
                className='rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2.5'
              >
                <p className='text-[9px] font-bold tracking-[0.16em] text-(--text-muted) uppercase'>
                  {TIER_LABELS[tier]}
                </p>
                <button
                  type='button'
                  disabled={isLoading}
                  onClick={() =>
                    setSpec({
                      key: `${tier}:all`,
                      tier,
                      gamas: 'all',
                      label: TIER_LABELS[tier],
                    })
                  }
                  className={`mt-1 block text-base font-semibold text-(--text-primary) ${clickableCls}`}
                >
                  {isLoading
                    ? '...'
                    : ((t?.gamas ?? 0) + (t?.nonGamas ?? 0)).toLocaleString(
                        'id-ID',
                      )}
                </button>
                <p className='mt-1 text-[10px] font-medium text-(--text-secondary)'>
                  <button
                    type='button'
                    disabled={isLoading}
                    onClick={() =>
                      setSpec({
                        key: `${tier}:gamas`,
                        tier,
                        gamas: 'gamas',
                        label: `${TIER_LABELS[tier]} · GAMAS`,
                      })
                    }
                    className={clickableCls}
                  >
                    GAMAS {t?.gamas ?? 0}
                  </button>{' '}
                  ·{' '}
                  <button
                    type='button'
                    disabled={isLoading}
                    onClick={() =>
                      setSpec({
                        key: `${tier}:non-gamas`,
                        tier,
                        gamas: 'non-gamas',
                        label: `${TIER_LABELS[tier]} · Non-GAMAS`,
                      })
                    }
                    className={clickableCls}
                  >
                    Non-GAMAS {t?.nonGamas ?? 0}
                  </button>
                </p>
              </div>
            );
          },
        )}
      </div>

      <div className='mt-3 flex flex-wrap items-center gap-4 border-t border-(--border) pt-3 text-[11px] text-(--text-secondary)'>
        <span>
          GAMAS:{' '}
          <button
            type='button'
            disabled={isLoading}
            onClick={() =>
              setSpec({
                key: 'all:gamas',
                tier: 'all',
                gamas: 'gamas',
                label: 'Semua Tier · GAMAS',
              })
            }
            className={`font-semibold text-(--text-primary) ${clickableCls}`}
          >
            {data?.gamasTotal ?? 0}
          </button>
        </span>
        <span>
          Non-GAMAS:{' '}
          <button
            type='button'
            disabled={isLoading}
            onClick={() =>
              setSpec({
                key: 'all:non-gamas',
                tier: 'all',
                gamas: 'non-gamas',
                label: 'Semua Tier · Non-GAMAS',
              })
            }
            className={`font-semibold text-(--text-primary) ${clickableCls}`}
          >
            {data?.nonGamasTotal ?? 0}
          </button>
        </span>
        {data?.target != null && (
          <span>
            Target:{' '}
            <span className='font-semibold text-(--text-primary)'>
              {data.target}
            </span>
          </span>
        )}
      </div>

      <AssuranceGuaranteeTicketsModal
        open={Boolean(spec)}
        spec={spec}
        onClose={() => setSpec(null)}
        workzone={workzone}
        branch={branch}
      />
    </div>
  );
}
