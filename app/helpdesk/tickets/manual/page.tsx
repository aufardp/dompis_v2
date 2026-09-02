'use client';

import { useEffect, useState, useRef } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

type Workzone = { id_sa: number; nama_sa: string | null };
type ManualRow = {
  service_no: string;
  workzone: string;
  customer_type: string;
  customer_name: string;
  contact_phone: string;
  summary: string;
  rk_information?: string;
};

export default function HelpdeskManualTicketPage() {
  const [workzones, setWorkzones] = useState<Workzone[]>([]);
  const [list, setList] = useState<unknown[]>([]);
  const [activeTab, setActiveTab] = useState<'single' | 'massal'>('single');

  const [serviceNo, setServiceNo] = useState('');
  const [workzone, setWorkzone] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [summary, setSummary] = useState('');
  const [alamat, setAlamat] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [rk, setRk] = useState('');
  const [category, setCategory] = useState<'GANGGUAN' | 'PSB'>('GANGGUAN');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [pasteText, setPasteText] = useState('');
  const [massalRows, setMassalRows] = useState<ManualRow[]>([]);
  const [massalErrors, setMassalErrors] = useState<string[]>([]);
  const [massalLoading, setMassalLoading] = useState(false);
  const [massalResult, setMassalResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadWorkzones = async () => {
      try {
        const r = await fetchWithAuth('/api/users/me/sa');
        const d = await r?.json();
        if (d?.success && Array.isArray(d.data) && d.data.length > 0) {
          setWorkzones(d.data);
          return;
        }
        const r2 = await fetchWithAuth('/api/sa');
        const d2 = await r2?.json();
        if (d2?.success && Array.isArray(d2.data)) {
          const mapped = d2.data.map(
            (item: {
              id_sa?: number;
              value?: string;
              nama_sa?: string | null;
              label?: string | null;
            }) => ({
              id_sa: Number(item.id_sa ?? item.value),
              nama_sa: item.nama_sa ?? item.label ?? null,
            }),
          );
          setWorkzones(
            mapped.filter((x: Workzone) => Number.isFinite(x.id_sa)),
          );
        }
      } catch {}
    };
    loadWorkzones();
    fetchList();
  }, []);

  const fetchList = async () => {
    const res = await fetchWithAuth('/api/tickets/manual');
    if (res?.ok) {
      const d = await res.json();
      if (d.success) setList(d.data || []);
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !serviceNo ||
      !workzone ||
      !customerType ||
      !customerName ||
      !contactPhone ||
      !summary
    ) {
      setMsg(
        'Semua field wajib (service_no, workzone, customer_type, customer_name, contact_phone, summary)',
      );
      return;
    }
    setLoading(true);
    setMsg(null);
    const res = await fetch('/api/tickets/manual', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service_no: serviceNo,
        workzone,
        customer_type: customerType,
        customer_name: customerName,
        contact_phone: contactPhone,
        summary,
        alamat: alamat || undefined,
        device_name: deviceName || undefined,
        manual_category: category,
        manual_notes: notes || undefined,
        rk_information: rk || undefined,
      }),
      credentials: 'include',
    });
    const data = await res.json();
    if (data.success) {
      setMsg(`Berhasil: ${data.data.incident}`);
      setServiceNo('');
      setCustomerType('');
      setCustomerName('');
      setContactPhone('');
      setSummary('');
      setAlamat('');
      setDeviceName('');
      setRk('');
      setNotes('');
      fetchList();
    } else setMsg(data.message || 'Gagal');
    setLoading(false);
  };

  const parsePaste = () => {
    setMassalErrors([]);
    setMassalResult(null);
    const text = pasteText.trim();
    if (!text) {
      setMassalErrors(['Paste kosong']);
      return;
    }
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      setMassalErrors([
        'Minimal header + 1 baris. Header: service_no,workzone,customer_type,customer_name,contact_phone,summary',
      ]);
      return;
    }
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const required = [
      'service_no',
      'workzone',
      'customer_type',
      'customer_name',
      'contact_phone',
      'summary',
    ];
    const idx: Record<string, number> = {};
    header.forEach((h, i) => (idx[h] = i));
    const missing = required.filter((c) => idx[c] === undefined);
    if (missing.length) {
      setMassalErrors([
        `Header kurang: ${missing.join(', ')} (header: ${header.join(', ')})`,
      ]);
      return;
    }
    const rows: ManualRow[] = [];
    const errs: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const row: ManualRow = {
        service_no: cols[idx['service_no']] || '',
        workzone: cols[idx['workzone']] || '',
        customer_type: cols[idx['customer_type']] || '',
        customer_name: cols[idx['customer_name']] || '',
        contact_phone: cols[idx['contact_phone']] || '',
        summary: cols[idx['summary']] || '',
        rk_information:
          idx['rk_information'] !== undefined
            ? cols[idx['rk_information']]
            : undefined,
      };
      const empty = required.filter((c) => !row[c as keyof ManualRow]);
      if (empty.length) {
        errs.push(`Baris ${i + 1}: ${empty.join(', ')} kosong`);
        continue;
      }
      rows.push(row);
      if (rows.length >= 1000) {
        errs.push(`Dibatasi 1000 rows`);
        break;
      }
    }
    setMassalRows(rows);
    setMassalErrors(errs);
  };

  const handleFile = async (file: File) => {
    setMassalErrors([]);
    setMassalResult(null);
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) {
      const text = await file.text();
      setPasteText(text);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const idx: Record<string, number> = {};
      header.forEach((h, i) => (idx[h] = i));
      const rows: ManualRow[] = [];
      const errs: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        const row: ManualRow = {
          service_no: cols[idx['service_no']] || '',
          workzone: cols[idx['workzone']] || '',
          customer_type: cols[idx['customer_type']] || '',
          customer_name: cols[idx['customer_name']] || '',
          contact_phone: cols[idx['contact_phone']] || '',
          summary: cols[idx['summary']] || '',
        };
        if (
          !row.service_no ||
          !row.workzone ||
          !row.customer_type ||
          !row.customer_name ||
          !row.contact_phone ||
          !row.summary
        ) {
          errs.push(`Baris ${i + 1}: wajib kosong`);
          continue;
        }
        rows.push(row);
      }
      setMassalRows(rows);
      setMassalErrors(errs);
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      try {
        const xlsx = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = xlsx.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = xlsx.utils.sheet_to_json<Record<string, string>>(sheet, {
          header: 1,
        }) as unknown as string[][];
        const header = (json[0] as string[]).map((h) =>
          String(h || '')
            .trim()
            .toLowerCase(),
        );
        const idx: Record<string, number> = {};
        header.forEach((h, i) => (idx[h] = i));
        const rows: ManualRow[] = [];
        const errs: string[] = [];
        for (let i = 1; i < json.length; i++) {
          const cols = json[i] as string[];
          const row: ManualRow = {
            service_no: String(cols[idx['service_no']] || '').trim(),
            workzone: String(cols[idx['workzone']] || '').trim(),
            customer_type: String(cols[idx['customer_type']] || '').trim(),
            customer_name: String(cols[idx['customer_name']] || '').trim(),
            contact_phone: String(cols[idx['contact_phone']] || '').trim(),
            summary: String(cols[idx['summary']] || '').trim(),
          };
          if (
            !row.service_no ||
            !row.workzone ||
            !row.customer_type ||
            !row.customer_name ||
            !row.contact_phone ||
            !row.summary
          ) {
            errs.push(`Baris ${i + 1}: wajib kosong`);
            continue;
          }
          rows.push(row);
          if (rows.length >= 1000) break;
        }
        setMassalRows(rows);
        setMassalErrors(errs);
        setPasteText(`Loaded ${rows.length} rows dari ${file.name}`);
      } catch (e) {
        setMassalErrors(['Gagal parse Excel: ' + String(e)]);
      }
    } else {
      setMassalErrors(['Format harus .csv, .xlsx, .xls']);
    }
  };

  const handleBulkSubmit = async () => {
    if (massalRows.length === 0) {
      setMassalErrors(['Tidak ada rows valid']);
      return;
    }
    setMassalLoading(true);
    setMassalResult(null);
    const res = await fetch('/api/tickets/manual/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows: massalRows }),
      credentials: 'include',
    });
    const data = await res.json();
    if (data.success) {
      setMassalResult(
        `Berhasil ${data.data.inserted} dari ${data.data.total}, gagal ${data.data.failed.length}. Contoh: ${(data.data.incidents || []).join(', ')}`,
      );
      setMassalRows([]);
      setPasteText('');
      fetchList();
    } else {
      setMassalErrors([data.message || JSON.stringify(data.errors)]);
      if (data.failed)
        setMassalErrors((prev) => [
          ...prev,
          ...data.failed.map(
            (f: { row: number; reason: string }) => `Row ${f.row}: ${f.reason}`,
          ),
        ]);
    }
    setMassalLoading(false);
  };

  const downloadTemplate = () => {
    const csv = `service_no,workzone,customer_type,customer_name,contact_phone,summary,rk_information
650123456,SA_KPO,DATIN,PT ABC,08123456789,Gangguan internet DATIN,ODC-RKT-FDM
650123457,SA_BKL,TSEL,John Doe,08123456780,Request TSEL,
`;
    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-manual.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className='mx-auto max-w-5xl space-y-6 p-6'>
      <div>
        <h1 className='text-2xl font-bold'>Tiket Manual / Non-Tiket</h1>
        <p className='text-sm text-slate-500'>
          Format wajib:{' '}
          <span className='font-mono font-semibold'>
            service_no, workzone, customer_type, customer_name, contact_phone,
            summary
          </span>{' '}
          (semua wajib). Incident auto{' '}
          <span className='font-mono'>
            INC-{'{CT}'}
            {'{DDMMYY}'}
            {'{NN}'}
          </span>{' '}
          contoh <span className='font-mono'>INC-DATIN31082601</span>, reset
          harian. Jenis ticket otomatis manual{' '}
          <span className='font-mono'>manual</span>. Massal 1000 rows.
        </p>
      </div>

      <div className='flex gap-2'>
        <button
          onClick={() => setActiveTab('single')}
          className={`rounded-full px-4 py-2 text-sm font-medium ${activeTab === 'single' ? 'bg-blue-600 text-white' : 'border bg-white'}`}
        >
          Single
        </button>
        <button
          onClick={() => setActiveTab('massal')}
          className={`rounded-full px-4 py-2 text-sm font-medium ${activeTab === 'massal' ? 'bg-blue-600 text-white' : 'border bg-white'}`}
        >
          Massal (Paste+Upload)
        </button>
        <button
          onClick={downloadTemplate}
          className='ml-auto rounded-full border bg-white px-4 py-2 text-sm'
        >
          Download Template CSV
        </button>
      </div>

      {activeTab === 'single' ? (
        <form
          onSubmit={handleSingleSubmit}
          className='space-y-4 rounded-2xl border bg-white p-6'
        >
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div>
              <label className='text-sm font-medium'>Service No *</label>
              <input
                value={serviceNo}
                onChange={(e) => setServiceNo(e.target.value)}
                placeholder='650123...'
                className='mt-1 w-full rounded-lg border px-3 py-2'
              />
            </div>
            <div>
              <label className='text-sm font-medium'>Workzone (STO) *</label>
              <select
                value={workzone}
                onChange={(e) => setWorkzone(e.target.value)}
                className='mt-1 w-full rounded-lg border px-3 py-2'
              >
                <option value=''>Pilih STO</option>
                {workzones.map((wz, idx) => (
                  <option key={`${wz.id_sa}-${idx}`} value={wz.nama_sa || ''}>
                    {wz.nama_sa || `SA ${wz.id_sa}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className='text-sm font-medium'>Customer Type *</label>
              <input
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value)}
                placeholder='DATIN / TSEL'
                className='mt-1 w-full rounded-lg border px-3 py-2'
              />
            </div>
            <div>
              <label className='text-sm font-medium'>Customer Name *</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder='PT ABC / John'
                className='mt-1 w-full rounded-lg border px-3 py-2'
              />
            </div>
            <div>
              <label className='text-sm font-medium'>Contact Phone *</label>
              <input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder='0812...'
                className='mt-1 w-full rounded-lg border px-3 py-2'
              />
            </div>
            <div>
              <label className='text-sm font-medium'>RK Information</label>
              <input
                value={rk}
                onChange={(e) => setRk(e.target.value)}
                placeholder='ODC-...'
                className='mt-1 w-full rounded-lg border px-3 py-2'
              />
            </div>
          </div>
          <div>
            <label className='text-sm font-medium'>Summary *</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder='Ringkasan gangguan'
              className='mt-1 w-full rounded-lg border px-3 py-2'
            />
          </div>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div>
              <label className='text-sm font-medium'>Kategori</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as never)}
                className='mt-1 w-full rounded-lg border px-3 py-2'
              >
                <option value='GANGGUAN'>GANGGUAN</option>
                <option value='PSB'>PSB</option>
              </select>
            </div>
            <div>
              <label className='text-sm font-medium'>Device Name</label>
              <input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className='mt-1 w-full rounded-lg border px-3 py-2'
              />
            </div>
          </div>
          <div>
            <label className='text-sm font-medium'>Alamat</label>
            <textarea
              value={alamat}
              onChange={(e) => setAlamat(e.target.value)}
              rows={2}
              className='mt-1 w-full rounded-lg border px-3 py-2'
            />
          </div>
          <div>
            <label className='text-sm font-medium'>Catatan Manual</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className='mt-1 w-full rounded-lg border px-3 py-2'
            />
          </div>
          {msg && (
            <div className='rounded-lg bg-blue-50 p-3 text-sm text-blue-700'>
              {msg}
            </div>
          )}
          <button
            disabled={loading}
            type='submit'
            className='w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50'
          >
            {loading ? 'Menyimpan...' : 'Buat Tiket Manual'}
          </button>
        </form>
      ) : (
        <div className='space-y-4 rounded-2xl border bg-white p-6'>
          <div>
            <label className='text-sm font-medium'>
              Paste CSV (header wajib:
              service_no,workzone,customer_type,customer_name,contact_phone,summary)
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              placeholder={
                'service_no,workzone,customer_type,customer_name,contact_phone,summary\n6501,SA_KPO,DATIN,PT ABC,0812,Gangguan\n6502,SA_BKL,TSEL,John,0813,Request TSEL'
              }
              className='mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs'
            />
            <div className='mt-2 flex gap-2'>
              <button
                onClick={parsePaste}
                className='rounded-lg bg-slate-800 px-4 py-2 text-sm text-white'
              >
                Preview Paste
              </button>
              <label className='cursor-pointer rounded-lg border bg-white px-4 py-2 text-sm'>
                Upload CSV/XLSX
                <input
                  ref={fileRef}
                  type='file'
                  accept='.csv,.xlsx,.xls'
                  className='hidden'
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </label>
              <button
                onClick={() => {
                  setPasteText('');
                  setMassalRows([]);
                  setMassalErrors([]);
                  setMassalResult(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                className='rounded-lg border px-4 py-2 text-sm'
              >
                Clear
              </button>
            </div>
          </div>

          {massalErrors.length > 0 && (
            <div className='rounded-lg bg-amber-50 p-3 text-xs text-amber-800'>
              {massalErrors.map((e, i) => (
                <div key={i}>• {e}</div>
              ))}
            </div>
          )}

          {massalRows.length > 0 && (
            <div>
              <p className='text-sm font-medium'>
                Preview {massalRows.length} rows (max 1000, tampil 20):
              </p>
              <div className='mt-2 max-h-75 overflow-auto rounded-lg border'>
                <table className='w-full text-left text-xs'>
                  <thead className='sticky top-0 bg-slate-50'>
                    <tr>
                      <th className='px-2 py-1'>service_no</th>
                      <th className='px-2 py-1'>workzone</th>
                      <th className='px-2 py-1'>customer_type</th>
                      <th className='px-2 py-1'>customer_name</th>
                      <th className='px-2 py-1'>contact_phone</th>
                      <th className='px-2 py-1'>summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {massalRows.slice(0, 20).map((r, idx) => (
                      <tr key={idx} className='border-t'>
                        <td className='px-2 py-1 font-mono'>{r.service_no}</td>
                        <td className='px-2 py-1'>{r.workzone}</td>
                        <td className='px-2 py-1'>{r.customer_type}</td>
                        <td className='px-2 py-1'>{r.customer_name}</td>
                        <td className='px-2 py-1'>{r.contact_phone}</td>
                        <td className='max-w-37.5 truncate px-2 py-1'>
                          {r.summary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {massalRows.length > 20 && (
                <p className='mt-1 text-xs text-slate-500'>
                  ... dan {massalRows.length - 20} lagi
                </p>
              )}
              <button
                onClick={handleBulkSubmit}
                disabled={massalLoading}
                className='mt-3 w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50'
              >
                {massalLoading
                  ? 'Mengirim...'
                  : `Buat ${massalRows.length} Tiket Manual`}
              </button>
            </div>
          )}

          {massalResult && (
            <div className='rounded-lg bg-green-50 p-3 text-sm text-green-700'>
              {massalResult}
            </div>
          )}
        </div>
      )}

      <div className='rounded-2xl border bg-white p-4'>
        <h3 className='font-semibold'>Daftar Tiket Manual (100 terbaru)</h3>
        <div className='mt-3 max-h-100 overflow-auto text-sm'>
          {list.length === 0 ? (
            <p className='text-slate-500'>Belum ada</p>
          ) : (
            <table className='w-full text-left'>
              <thead className='text-xs text-slate-500'>
                <tr>
                  <th className='py-1'>Incident</th>
                  <th>Workzone</th>
                  <th>Kategori</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(
                  list as Array<{
                    incident: string;
                    workzone: string | null;
                    manual_category: string | null;
                    status_update: string | null;
                  }>
                ).map((r) => (
                  <tr key={r.incident} className='border-t'>
                    <td className='py-1 font-mono text-xs'>{r.incident}</td>
                    <td>{r.workzone}</td>
                    <td>{r.manual_category}</td>
                    <td>{r.status_update}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
