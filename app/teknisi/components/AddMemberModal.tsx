'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { INVITE_CONFIG } from '@/app/config/invite';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: number;
  incident: string;
}

interface InviteData {
  token: string;
  qrUrl: string;
  expiresAt: string;
  ttlSeconds: number;
}

export default function AddMemberModal({ isOpen, onClose, ticketId, incident }: AddMemberModalProps) {
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  const generateInvite = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, incident }),
      });
      const data = await res?.json();
      if (data?.success) {
        setInvite(data.data);
        setRemainingSeconds(data.data.ttlSeconds);
      } else {
        setError(data?.message ?? 'Gagal generate invite');
      }
    } catch {
      setError('Koneksi gagal');
    } finally {
      setLoading(false);
    }
  }, [ticketId, incident]);

  useEffect(() => {
    if (isOpen && !invite) {
      void generateInvite();
    }
  }, [isOpen, invite, generateInvite]);

  useEffect(() => {
    if (!invite || remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [invite, remainingSeconds]);

  const copyLink = () => {
    if (invite?.qrUrl) {
      void navigator.clipboard.writeText(invite.qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isExpired = remainingSeconds <= 0;

  if (!isOpen) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
      onClick={onClose}
    >
      <div
        className='w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700'>
          <div>
            <h2 className='font-bold text-slate-800 dark:text-slate-100'>Undang Teman</h2>
            <p className='text-xs text-slate-400 mt-0.5'>{incident}</p>
          </div>
          <button
            onClick={onClose}
            className='text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none'
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className='p-5 space-y-4'>
          {loading && (
            <div className='text-center py-8'>
              <span className='animate-spin text-3xl'>⟳</span>
              <p className='mt-2 text-sm text-slate-500'>Generating QR...</p>
            </div>
          )}

          {error && (
            <div className='text-center py-6 space-y-3'>
              <p className='text-red-500 text-sm font-semibold'>{error}</p>
              <button
                onClick={() => void generateInvite()}
                className='px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700'
              >
                Coba Lagi
              </button>
            </div>
          )}

          {invite && !loading && !error && (
            <>
              {/* Timer badge */}
              <div className='flex items-center justify-center'>
                <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                  isExpired
                    ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                    : 'bg-amber-50 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
                }`}>
                  <span className={!isExpired ? 'animate-pulse' : ''}>⏱</span>
                  {isExpired ? 'Expired' : `${remainingSeconds}s`}
                </div>
              </div>

              {/* QR Code */}
              <div className='flex justify-center bg-white dark:bg-slate-900 rounded-xl p-4'>
                {isExpired ? (
                  <div className='w-48 h-48 flex items-center justify-center text-slate-400 text-sm text-center'>
                    QR Code expired<br />Klik regenerate
                  </div>
                ) : (
                  <QRCodeSVG value={invite.qrUrl} size={192} level='M' />
                )}
              </div>

              {/* Instructions */}
              <div className='text-center space-y-1'>
                <p className='text-sm font-semibold text-slate-700 dark:text-slate-200'>
                  {isExpired ? 'QR Expired' : 'Teman scan QR ini'}
                </p>
                <p className='text-xs text-slate-400'>
                  {isExpired
                    ? 'Klik tombol di bawah untuk generate ulang'
                    : 'Buka menu Scan Invite di aplikasi Dompis'}
                </p>
              </div>

              {/* Copy link */}
              <div className='flex gap-2'>
                <input
                  readOnly
                  value={invite.qrUrl}
                  className='flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-500 truncate'
                />
                <button
                  onClick={copyLink}
                  className='shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                >
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>

              {/* Actions */}
              <div className='flex gap-2'>
                {isExpired ? (
                  <button
                    onClick={() => void generateInvite()}
                    className='flex-1 rounded-xl bg-blue-600 text-white py-2.5 text-sm font-bold hover:bg-blue-700 flex items-center justify-center gap-2'
                  >
                    Regenerate QR
                  </button>
                ) : (
                  <button
                    onClick={() => void generateInvite()}
                    className='flex-1 rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
                  >
                    Generate Baru
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}