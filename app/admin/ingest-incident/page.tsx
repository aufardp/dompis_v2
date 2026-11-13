'use client';

import { useMemo, useRef } from 'react';
import Link from 'next/link';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import {
  MAX_BULK_INCIDENTS,
  MAX_INCIDENT_INPUT_LENGTH,
  parseIncidentInput,
} from '@/lib/ingestion/incident-input';
import { useIncidentIngestion } from './use-incident-ingestion';
import { focusStyle, IncidentResults, secondaryButton } from './results';

export default function IngestIncidentPage() {
  const { user } = useCurrentUser();
  const ingestion = useIncidentIngestion(user?.id_user);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const parsed = useMemo(() => {
    try {
      return { ...parseIncidentInput(ingestion.input), error: '' };
    } catch (error) {
      return {
        incidents: [],
        invalid: [],
        duplicates: 0,
        error: (error as Error).message,
      };
    }
  }, [ingestion.input]);
  const invalid = !!parsed.error || parsed.invalid.length > 0;
  const reset = () => {
    ingestion.reset();
    requestAnimationFrame(() => textarea.current?.focus());
  };

  return (
    <AdminLayout>
      <div
        data-incident-ingestion
        className='mx-auto w-full max-w-5xl min-w-0 space-y-8 pb-8'
      >
        <header>
          <Link
            href='/admin/tools'
            className={`inline-flex min-h-11 items-center text-sm font-medium text-(--text-secondary) underline underline-offset-4 ${focusStyle}`}
          >
            Alat admin
          </Link>
          <h1 className='font-outfit mt-3 text-2xl font-bold text-(--text-primary) md:text-3xl'>
            Tarik incident Nossa
          </h1>
          <p className='mt-3 max-w-2xl text-base leading-relaxed text-(--text-secondary)'>
            Masukkan satu atau banyak ID incident untuk memperbarui data di
            Dompis. Hasil tersedia untuk setiap incident.
          </p>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid && parsed.incidents.length && ingestion.canStart)
              void ingestion.send(parsed.incidents);
          }}
          className='max-w-3xl space-y-4'
        >
          <div>
            <label
              htmlFor='incident-ids'
              className='mb-2 block text-base font-semibold text-(--text-primary)'
            >
              Daftar ID incident
            </label>
            <p
              id='incident-help'
              className='mb-3 text-sm leading-relaxed text-(--text-secondary)'
            >
              Pisahkan dengan baris baru, koma, atau spasi. Maksimal{' '}
              {MAX_BULK_INCIDENTS} incident per permintaan. ID duplikat dihitung
              sekali.
            </p>
            <textarea
              ref={textarea}
              id='incident-ids'
              rows={6}
              spellCheck={false}
              autoCapitalize='characters'
              maxLength={MAX_INCIDENT_INPUT_LENGTH}
              value={ingestion.input}
              readOnly={!!ingestion.requestId || ingestion.submitting}
              onChange={(event) => ingestion.setInput(event.target.value)}
              aria-invalid={invalid}
              aria-describedby={`incident-help incident-count${invalid ? ' incident-error' : ''}`}
              placeholder={'INC52661271\nINC51123643'}
              className={`block w-full resize-y rounded-lg border border-slate-500 bg-(--surface) px-4 py-3 text-base leading-relaxed text-(--text-primary) placeholder:text-slate-500 dark:border-slate-400 dark:placeholder:text-slate-400 ${focusStyle}`}
            />
            <p
              id='incident-count'
              className='mt-2 text-sm text-(--text-secondary)'
            >
              {parsed.incidents.length} ID unik
              {parsed.duplicates
                ? `, ${parsed.duplicates} duplikat diabaikan`
                : ''}
              .
            </p>
            {invalid && (
              <p
                id='incident-error'
                role='alert'
                className='mt-2 text-sm wrap-anywhere text-red-800 dark:text-red-300'
              >
                {parsed.error ||
                  `ID tidak valid: ${parsed.invalid
                    .slice(0, 5)
                    .map((value) => value.slice(0, 80))
                    .join(
                      ', ',
                    )}${parsed.invalid.length > 5 ? ', dan lainnya' : ''}. Gunakan INC diikuti 6 sampai 20 digit.`}
              </p>
            )}
          </div>
          {!ingestion.requestId && (
            <button
              type='submit'
              disabled={
                !ingestion.ready ||
                ingestion.submitting ||
                invalid ||
                !parsed.incidents.length
              }
              className={`min-h-11 w-full rounded-lg bg-blue-700 px-5 py-3 text-base font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-700 sm:w-auto dark:bg-blue-300 dark:text-slate-950 dark:hover:bg-blue-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-300 ${focusStyle}`}
            >
              Tarik {parsed.incidents.length || ''} incident
            </button>
          )}
        </form>

        {ingestion.requestId ? (
          <div className='space-y-3 text-sm text-(--text-secondary)'>
            <p className='wrap-anywhere'>
              ID permintaan:{' '}
              <span className='select-all'>{ingestion.requestId}</span>
            </p>
            <p>
              Status tersimpan selama 24 jam. Anda dapat meninggalkan halaman
              lalu membuka kembali alamat ini.
            </p>
            {ingestion.submitting && (
              <p role='status'>Mengirim daftar incident...</p>
            )}
            {!ingestion.report && !ingestion.error && !ingestion.submitting && (
              <p role='status'>Memeriksa status permintaan...</p>
            )}
            {ingestion.error && (
              <p
                role='alert'
                className='wrap-anywhere text-red-800 dark:text-red-300'
              >
                {ingestion.error.message}{' '}
                {ingestion.report
                  ? 'Status terakhir yang berhasil dibaca tetap ditampilkan.'
                  : 'Periksa status atau lanjutkan pengiriman dengan daftar yang sama.'}
              </p>
            )}
            {!!ingestion.report?.pendingEnqueue && (
              <p role='status'>
                {ingestion.report.pendingEnqueue} incident belum masuk antrean.
                Lanjutkan pengiriman untuk melengkapi daftar ini.
              </p>
            )}
            <div className='flex flex-wrap gap-3'>
              <button
                type='button'
                onClick={ingestion.refresh}
                disabled={ingestion.submitting || ingestion.fetching}
                className={secondaryButton}
              >
                {ingestion.fetching ? 'Memeriksa status...' : 'Periksa status'}
              </button>
              {ingestion.canResume &&
                (!!ingestion.error || !!ingestion.report?.pendingEnqueue) && (
                  <button
                    type='button'
                    onClick={() => void ingestion.resume()}
                    disabled={ingestion.submitting}
                    className={secondaryButton}
                  >
                    Lanjutkan pengiriman
                  </button>
                )}
              {!ingestion.report && ingestion.canStart && (
                <button
                  type='button'
                  onClick={reset}
                  className={secondaryButton}
                >
                  Daftar baru
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className='max-w-2xl text-sm leading-relaxed text-(--text-secondary)'>
            Belum ada permintaan. Setelah daftar dikirim, Anda bisa melihat
            progres dan mencoba ulang incident yang gagal.
          </p>
        )}

        {ingestion.report && (
          <IncidentResults
            key={ingestion.report.requestId}
            report={ingestion.report}
            busy={ingestion.submitting}
            onRetry={() => void ingestion.retryFailed()}
            onReset={reset}
          />
        )}
      </div>
    </AdminLayout>
  );
}
