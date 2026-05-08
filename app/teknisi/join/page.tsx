'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { Scanner } from '@yudiel/react-qr-scanner';

interface JoinResult {
  success: boolean;
  data?: {
    message: string;
    ticketId: number;
    incident: string;
  };
  message?: string;
}

export default function JoinPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'scanning' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState<{ message: string; ticketId: number; incident: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scannedToken, setScannedToken] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetchWithAuth('/api/technicians/attendance/status');
      if (!res || !res.ok) {
        router.replace('/login?redirect=/teknisi/join');
        return;
      }
      setStatus('scanning');
    } catch {
      router.replace('/login?redirect=/teknisi/join');
    }
  };

  const handleScan = (token: string) => {
    if (processing || scannedToken === token) return;
    setProcessing(true);
    setScannedToken(token);

    void (async () => {
      try {
        const res = await fetch('/api/team/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });

        const data: JoinResult = await res.json();

        if (data.success) {
          setStatus('success');
          setSuccessData(data.data ?? null);
        } else {
          setStatus('error');
          setErrorMsg(data.message ?? 'Gagal join tim');
          setTimeout(() => {
            setStatus('scanning');
            setScannedToken('');
            setProcessing(false);
          }, 3000);
        }
      } catch {
        setStatus('error');
        setErrorMsg('Koneksi gagal');
        setTimeout(() => {
          setStatus('scanning');
          setScannedToken('');
          setProcessing(false);
        }, 3000);
      }
    })();
  };

  if (status === 'loading') {
    return (
      <div className='min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center'>
        <div className='text-center space-y-3'>
          <div className='text-4xl animate-pulse'>📷</div>
          <p className='text-slate-500 dark:text-slate-400'>Memuat scanner...</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className='min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4'>
        <div className='text-center space-y-4 max-w-sm mx-auto'>
          <div className='text-6xl'>🎉</div>
          <div className='bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 space-y-3'>
            <h2 className='text-xl font-bold text-emerald-600 dark:text-emerald-400'>Berhasil Join Tim!</h2>
            {successData && (
              <p className='text-slate-500 dark:text-slate-400'>
                Anda berhasil join tim untuk ticket <strong>{successData.incident}</strong>
              </p>
            )}
            <button
              onClick={() => router.push('/teknisi')}
              className='w-full rounded-xl bg-blue-600 text-white py-2.5 font-bold hover:bg-blue-700 transition-colors'
            >
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className='min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4'>
        <div className='text-center space-y-4 max-w-sm mx-auto'>
          <div className='text-6xl'>❌</div>
          <div className='bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 space-y-3'>
            <h2 className='text-xl font-bold text-red-600 dark:text-red-400'>Gagal Join Tim</h2>
            <p className='text-slate-500 dark:text-slate-400'>{errorMsg}</p>
            <p className='text-xs text-slate-400'>Akan coba ulang otomatis...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col'>
      {/* Header */}
      <div className='sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3'>
        <div className='flex items-center justify-between max-w-lg mx-auto'>
          <button
            onClick={() => router.push('/teknisi')}
            className='flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm font-bold'
          >
            ← Kembali
          </button>
          <h1 className='text-base font-bold text-slate-800 dark:text-slate-100'>Scan Invite</h1>
          <div className='w-16' />
        </div>
      </div>

      {/* Scanner */}
      <div className='flex-1 flex flex-col max-w-lg mx-auto w-full'>
        <div className='relative flex-1 overflow-hidden rounded-none'>
          <Scanner
            onScan={(result: Array<{ rawValue: string }>) => {
              const first = result?.[0];
              if (!first?.rawValue) return;
              const token = first.rawValue;
              if (token.startsWith('/teknisi/join?token=')) {
                void handleScan(token.replace('/teknisi/join?token=', ''));
              } else if (token.includes('token=')) {
                const match = token.match(/token=([^&]+)/);
                if (match) void handleScan(match[1]);
              } else {
                void handleScan(token);
              }
            }}
            scanDelay={500}
            constraints={{ facingMode: 'environment' }}
            styles={{ container: { width: '100%', height: '100%' } }}
          />
          {/* Overlay */}
          <div className='absolute inset-0 pointer-events-none flex items-center justify-center'>
            <div className='w-56 h-56 border-2 border-white/50 rounded-2xl' />
          </div>
        </div>

        {/* Bottom instructions */}
        <div className='bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-4'>
          <div className='text-center space-y-1.5'>
            <p className='text-sm font-bold text-slate-700 dark:text-slate-200'>Arahkan kamera ke QR Code</p>
            <p className='text-xs text-slate-400'>QR Code ditampilkan di layar teknisi yang menginvite</p>
          </div>
          {processing && (
            <div className='mt-3 flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 text-sm font-bold'>
              <span className='animate-spin'>⟳</span>
              Memproses...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}