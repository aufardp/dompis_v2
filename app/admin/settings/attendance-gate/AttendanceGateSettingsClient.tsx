'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { ArrowLeft } from 'lucide-react';

type Gates = { b2b: boolean; b2c: boolean; unset: boolean };

export default function AttendanceGateSettingsClient() {
  const router = useRouter();
  const [gates, setGates] = useState<Gates>({ b2b: true, b2c: true, unset: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchGates = async () => {
    const res = await fetchWithAuth('/api/admin/settings/attendance-gate');
    if (res?.ok) {
      const data = await res.json();
      if (data.success) setGates(data.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGates();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await fetch('/api/admin/settings/attendance-gate', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gates),
      credentials: 'include',
    });
    const data = await res.json();
    if (data.success) {
      setMsg('Berhasil disimpan');
      setGates(data.data);
    } else {
      setMsg(data.message || 'Gagal simpan');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-8">Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-xl border border-(--border) bg-white px-3 py-2 text-sm font-medium text-(--text-secondary) hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </button>

        <div>
          <h1 className="text-2xl font-bold">Attendance Gate</h1>
          <p className="text-sm text-slate-500">Atur apakah teknisi wajib absen sebelum auto-assign per spesialisasi. OFF = langsung assign meski belum absen (lebih pagi).</p>
        </div>

      <div className="rounded-xl border bg-white dark:bg-slate-800 p-6 space-y-4">
        {(
          [
            { key: 'b2b' as const, label: 'B2B', desc: 'Teknisi segment B2B (Datin, Indibiz, Reseller, etc.)' },
            { key: 'b2c' as const, label: 'B2C', desc: 'Teknisi segment B2C (Reguler, HVC, SQM)' },
            { key: 'unset' as const, label: 'Belum dispesialisasi', desc: 'NULL / BOTH' },
          ] as const
        ).map((item) => (
          <label key={item.key} className="flex items-start justify-between gap-4 rounded-lg border p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
            <div>
              <div className="font-medium">{item.label}</div>
              <div className="text-xs text-slate-500">{item.desc}</div>
              <div className="mt-1 text-xs">
                Status: <span className={gates[item.key] ? 'text-amber-600' : 'text-green-600'}>{gates[item.key] ? 'ON (wajib absen)' : 'OFF (langsung assign)'}</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={gates[item.key]}
              onChange={(e) => setGates((prev) => ({ ...prev, [item.key]: e.target.checked }))}
              className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600"
            />
          </label>
        ))}

        {msg && <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{msg}</div>}

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
      </div>
    </AdminLayout>
  );
}
