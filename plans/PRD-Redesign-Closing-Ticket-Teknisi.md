# PRD — Redesign UI/UX Closing Ticket untuk Teknisi
**Produk:** Dompis v2 — Telkom Akses Area 3 (Suramadu)
**Versi Dokumen:** 1.0
**Prinsip utama:** Seluruh perubahan di PRD ini **aditif dan reversibel** — tidak ada logic validasi, endpoint, atau data model yang diubah perilakunya. Fokusnya murni pada **lapisan orkestrasi/navigasi UI** di atas komponen yang sudah teruji.
**Status:** Belum ada implementasi

---

## 0. Koreksi Penting dari Diskusi Sebelumnya (Audit Ulang)

Setelah diskusi awal saya soal redesign closing flow, saya bedah lebih dalam `ModalFooter.tsx` dan komponen terkait — ternyata **beberapa hal yang saya usulkan sebelumnya sudah ada**, cuma belum tersambung sempurna. Saya revisi rencana berdasarkan temuan ini, supaya PRD ini benar-benar presisi (bukan membangun ulang yang sudah ada):

| Usulan awal saya | Temuan sebenarnya | Implikasi |
|---|---|---|
| "Bangun tombol CTA dinamis yang kasih tahu langkah berikutnya" | **Sudah ada** — `getCloseContent()` di `ModalFooter.tsx` sudah mengganti label tombol Close jadi "Isi Alamat"/"Isi Device"/"Isi Lokasi"/"Isi Detail"/"Foto x/y"/"Isi RCA" sesuai prioritas, lengkap dengan icon berubah-ubah | 🎯 **Temuan kunci**: tombol ini **disabled dan `onClick`-nya `undefined`** saat berstatus belum lengkap (`onClick={canClose ? onClose : undefined}`) — jadi labelnya sudah informatif, tapi **tidak bisa ditap untuk lompat ke bagian itu**. Teknisi harus scroll manual cari pill kecil di atasnya. Ini yang jadi Fitur A — perbaikan presisi, bukan bangun baru. |
| "Bangun saran RCA otomatis dari histori" | **Sudah ada** — `useRcaSuggestions` + `RcaSuggestionChips`, mencocokkan `device_name` + `symptom` dengan histori ticket closed, lengkap dengan state loading/data-tidak-cukup/tidak-ada-pola | Tidak perlu dibangun — fokus jadi **elevasi visibilitas** (Fitur C), chip ini saat ini dirender **di bawah** dropdown RCA manual, padahal harusnya jadi jalur utama |
| "RCA butuh search-as-you-type karena listnya panjang" | Saya cek `rcaMapping` — cuma **~12 kategori RCA utama** | Dropdown 12 opsi tidak butuh search — usulan awal saya kurang tepat, saya cabut dari rencana |

---

## FITUR A — Tombol Close Bisa Ditap Langsung ke Bagian yang Kurang

### A.1 Problem

Saat status ticket belum lengkap, tombol Close **sudah** menampilkan label informatif (mis. "Isi Alamat"), tapi menekannya **tidak melakukan apa-apa** — `onClick={canClose ? onClose : undefined}`. Teknisi harus tahu sendiri untuk scroll ke pill kecil di atas tombol untuk navigasi. Ini gesekan yang murni karena satu baris logic belum tersambung, bukan komponen yang hilang.

### A.2 Perubahan (satu file, minim risiko)

File: `app/teknisi/components/detail-modal/ModalFooter.tsx`

**Perluas `getCloseContent()` supaya juga mengembalikan handler navigasi**, memakai prop `onScrollToX` yang **sudah ada dan sudah dipakai pill** (tidak ada handler baru yang perlu dibuat):

```ts
// SEBELUM
const getCloseContent = () => {
  if (isAlamatEmpty) return { Icon: MapPin, main: 'Isi Alamat' };
  if (isDeviceNameEmpty) return { Icon: Smartphone, main: 'Isi Device' };
  if (geotagRequired && isLocationEmpty)
    return { Icon: MapPin, main: 'Isi Lokasi' };
  if (isDetailPerbaikanEmpty) return { Icon: FileText, main: 'Isi Detail' };
  if (isEvidenceIncomplete)
    return { Icon: Camera, main: `Foto ${photoCount}/${photoRequired}` };
  return { Icon: ClipboardList, main: 'Isi RCA' };
};

// SESUDAH
const getCloseContent = () => {
  if (isAlamatEmpty)
    return { Icon: MapPin, main: 'Isi Alamat', onNavigate: onScrollToAlamat };
  if (isDeviceNameEmpty)
    return { Icon: Smartphone, main: 'Isi Device', onNavigate: onScrollToDevice };
  if (geotagRequired && isLocationEmpty)
    return { Icon: MapPin, main: 'Isi Lokasi', onNavigate: onScrollToLocation };
  if (isDetailPerbaikanEmpty)
    return { Icon: FileText, main: 'Isi Detail', onNavigate: onScrollToDetail };
  if (isEvidenceIncomplete)
    return {
      Icon: Camera,
      main: `Foto ${photoCount}/${photoRequired}`,
      onNavigate: onScrollToFoto,
    };
  return { Icon: ClipboardList, main: 'Isi RCA', onNavigate: onScrollToRca };
};
```

**Ubah `onClick` tombol Close** — bukan diganti total, cuma ditambah cabang untuk kondisi disabled:
```tsx
// SEBELUM
<button
  onClick={canClose ? onClose : undefined}
  disabled={loadingClose || !canClose}
  ...
>

// SESUDAH
<button
  onClick={canClose ? onClose : closeReason.onNavigate}
  disabled={loadingClose}
  ...
>
```

**Penting:** `disabled={loadingClose}` (bukan lagi `|| !canClose`) — tombol **tetap bisa ditap** saat belum lengkap (supaya berfungsi sebagai navigasi), tapi `onClick`-nya diarahkan ke `closeReason.onNavigate` (scroll ke section terkait), **bukan** ke `onClose` (yang memicu API close). Ini menjamin: **tidak ada perubahan sama sekali ke kapan ticket benar-benar bisa di-close** — validasi `canClose` yang sudah teruji tetap jadi satu-satunya gerbang untuk memanggil `onClose`. Yang berubah murni: apa yang terjadi saat tombol ditekan ketika belum lengkap (dulu: diam, sekarang: navigasi).

### A.3 Kenapa Ini Aman untuk "Tidak Mengganggu Sistem yang Sudah Ada"

- Tidak menyentuh `canClose` (logic 6-kondisi yang sudah ada) sama sekali.
- Tidak menyentuh endpoint/API close ticket sama sekali.
- Tidak menghapus pill checklist yang sudah ada — pill tetap berfungsi seperti sekarang sebagai alternatif navigasi, sekarang cuma **ada dua cara** mencapai section yang sama (pill kecil, atau tombol besar) — user bebas pakai yang mana saja.
- Perubahan murni di 2 titik kecil dalam 1 file yang sudah ada.

---

## FITUR B — Satukan Alur Alamat + Lokasi

*(Ini melanjutkan rekomendasi dari diskusi sebelumnya — saya formalkan detail implementasinya di sini)*

### B.1 Problem

`AddressEditor` dan `LocationTagger` adalah dua komponen terpisah, padahal GPS yang diambil di `LocationTagger` bisa membantu isi draft alamat lebih cepat dibanding mengetik manual dari nol di `AddressEditor`.

### B.2 Desain — Tambahan, Bukan Penggantian Komponen

**Tidak membongkar `AddressEditor` atau `LocationTagger`.** Keduanya tetap komponen independen seperti sekarang (aman untuk kasus dipakai terpisah di tempat lain kalau ada). Yang ditambahkan: satu **jembatan opsional** di `TicketDetailModal.tsx` — setelah `LocationTagger` berhasil dapat koordinat GPS baru (state `filled` pertama kali, bukan saat reuse bank data), panggil reverse-geocoding (Nominatim OSM, gratis) dan **tawarkan** hasilnya ke `AddressEditor` lewat prop baru opsional:

```tsx
// AddressEditor.tsx — tambah prop baru, default undefined (tidak breaking existing usage)
interface AddressEditorProps {
  // ...props existing, tidak diubah...
  suggestedAddress?: string;      // BARU, opsional
  onUseSuggested?: () => void;    // BARU, opsional
}
```

Kalau `suggestedAddress` diisi **dan** field alamat masih kosong, tampilkan banner kecil di atas textarea (bukan auto-fill paksa):
```
📍 Perkiraan alamat dari GPS: "Jl. Tenggilis Utara II, Surabaya"
[ Pakai sebagai draft ]  [ Isi manual ]
```
Kalau field alamat **sudah** ada isinya (teknisi sudah duluan isi manual, atau reuse bank data lama), banner ini **tidak muncul sama sekali** — supaya tidak menimpa/mengganggu data yang sudah dimasukkan.

### B.3 Titik Integrasi di `TicketDetailModal.tsx`

```tsx
const [suggestedAddress, setSuggestedAddress] = useState<string | undefined>();

// Dipanggil dari callback LocationTagger saat GPS baru berhasil diambil (bukan reused bank data)
const handleNewLocationTagged = async (lat: number, lng: number) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    const data = await res.json();
    if (data?.display_name) setSuggestedAddress(data.display_name);
  } catch {
    // Gagal reverse-geocode bukan blocker — teknisi tetap bisa isi manual seperti biasa
  }
};
```
```tsx
<AddressEditor
  {/* ...props existing... */}
  suggestedAddress={suggestedAddress}
  onUseSuggested={() => setAlamat(suggestedAddress ?? '')}
/>
```

**Catatan penting:** panggilan ke Nominatim (layanan eksternal gratis) **wajib non-blocking dan fail-silent** — kalau API itu lambat/down, alur closing ticket **tidak boleh terganggu sedikit pun**. Bungkus dalam `try/catch`, jangan tampilkan error ke teknisi, cukup banner-nya tidak muncul.

### B.4 Kenapa Aman

- Kedua komponen asli tidak diubah struktur internalnya, cuma ditambah 2 prop opsional dengan default `undefined` — pemanggilan lama di tempat lain (kalau ada) tetap jalan tanpa perlu diubah.
- Reverse-geocoding murni penambah kenyamanan, kegagalannya tidak berdampak ke apa pun yang sudah berfungsi.

---

## FITUR C — Elevasi Saran RCA Otomatis

### C.1 Problem

`RcaSuggestionChips` (fitur pencocokan historis yang sudah matang) dirender **di bawah** dropdown RCA manual — posisi sekunder, padahal harusnya jadi jalur tercepat yang paling sering dipakai.

### C.2 Perubahan — Reorder Render, Bukan Logic Baru

File: `app/teknisi/components/TicketDetailModal.tsx`, bagian `rca-section`.

**Tukar urutan render**: `RcaSuggestionChips` dipindah ke **atas** `<select>` dropdown, dengan sedikit penyesuaian framing visual (bukan komponen baru — komponen yang sama, posisi + label pembuka berbeda):

```
┌─────────────────────────────────────┐
│ Root Cause Analysis (RCA)            │
│                                       │
│ 💡 Saran berdasarkan histori ODP ini │
│ [Redaman Tinggi ›]  [Konektor Kotor ›]│   ← RcaSuggestionChips, dipindah ke atas
│                                       │
│ Atau pilih manual:                   │
│ [ -- Pilih RCA -- ▾ ]                │   ← dropdown existing, sekarang framed sbg fallback
└─────────────────────────────────────┘
```

Kalau `rcaSuggestionState.status !== 'loaded'` atau `suggestions.length === 0` (data belum cukup/tidak ada pola cocok), tampilan otomatis kembali seperti sekarang (dropdown jadi elemen utama, tanpa banner "Atau pilih manual") — **tidak perlu logic tambahan**, karena `RcaSuggestionChips` **sudah** menangani kondisi-kondisi itu (mengembalikan `null` atau pesan informatif sesuai state, sudah saya cek kodenya).

### C.3 Kenapa Aman

- Tidak ada logic pencocokan/hook baru — `useRcaSuggestions` dan `RcaSuggestionChips` dipakai persis seperti sekarang, cuma posisi render dan sedikit teks pembuka yang berubah.
- `onPick` callback (yang mengisi `selectedRca`/`selectedSubRca`/`detailPerbaikan` sekaligus) tidak diubah sama sekali.

---

## FITUR D — Template Cepat & Voice-to-Text untuk Deskripsi Perbaikan

### D.1 Problem

Textarea `description_solution_dompis` (validasi backend: minimal 10 karakter) sering jadi hambatan kecil — teknisi malas mengetik panjang setelah kerja fisik.

### D.2 Desain

**Komponen baru** (bukan modifikasi textarea existing): `QuickReplyChips.tsx`, ditaruh tepat di atas textarea yang sudah ada.

```tsx
// app/teknisi/components/detail-modal/QuickReplyChips.tsx — BARU
const QUICK_TEMPLATES = [
  'Ganti patchcord',
  'Bersihkan konektor',
  'Re-splicing kabel',
  'Restart ONT',
  'Ganti ONT',
  'Perbaikan sambungan longgar',
]; // daftar awal usulan — sebaiknya divalidasi dengan Anda, atau nanti bisa dibuat dinamis dari RCA yang dipilih

interface Props {
  onPick: (text: string) => void;
}

export default function QuickReplyChips({ onPick }: Props) {
  return (
    <div className='mb-2 flex flex-wrap gap-1.5'>
      {QUICK_TEMPLATES.map((t) => (
        <button
          key={t}
          type='button'
          onClick={() => onPick(t)}
          className='rounded-full border border-(--border) bg-(--surface-2) px-2.5 py-1 text-[11px] font-medium text-(--text-secondary) hover:bg-(--surface-3)'
        >
          {t}
        </button>
      ))}
    </div>
  );
}
```

Di `TicketDetailModal.tsx`, `onPick` **menambahkan** teks ke textarea yang sudah ada (append, bukan replace, supaya bisa gabung beberapa template + tulisan manual):
```tsx
<QuickReplyChips
  onPick={(text) =>
    setDetailPerbaikan((prev) => (prev ? `${prev}, ${text}` : text))
  }
/>
<textarea
  value={detailPerbaikan}
  onChange={(e) => setDetailPerbaikan(e.target.value)}
  {/* ...props existing, tidak diubah... */}
/>
```

**Tombol mikrofon** (opsional, Web Speech API) — ditambahkan sebagai ikon kecil di pojok textarea, memakai `webkitSpeechRecognition`/`SpeechRecognition` browser native (tidak butuh dependency baru). Karena dukungan browser bervariasi, **wajib ada feature-detect**: kalau `window.SpeechRecognition` tidak tersedia, ikon mikrofon tidak dirender sama sekali (bukan ditampilkan lalu error saat ditekan).

### D.3 Kenapa Aman

- Textarea aslinya, `value`/`onChange`, dan validasi backend (min 10 karakter) **tidak disentuh** — `QuickReplyChips` cuma menyuntik teks ke state yang sudah ada, seolah-olah teknisi mengetik sendiri.
- Fitur suara sepenuhnya opsional dan graceful-degrade kalau browser tidak mendukung.

---

## FITUR E — Layar Ringkasan Sebelum Benar-Benar Close

### E.1 Problem

Begitu `canClose === true` dan teknisi tekan tombol, ticket **langsung** ter-close (asumsi saya — perlu diverifikasi saat audit kode `onClose` handler persis). Tidak ada titik "review sekali lagi" sebelum data masuk permanen.

### E.2 Desain — Bungkus, Jangan Ganti, Handler `onClose`

**Komponen baru:** `CloseConfirmationSheet.tsx` — bottom sheet ringkasan, muncul **sebelum** `onClose` (handler existing yang memanggil API close) benar-benar dipanggil.

```tsx
// TicketDetailModal.tsx
const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);

// SEBELUM: <ModalFooter ... onClose={handleCloseTicket} ... />
// SESUDAH:
<ModalFooter
  {/* ...props lain tidak berubah... */}
  onClose={() => setShowCloseConfirmation(true)}  // ← diarahkan ke sheet dulu, BUKAN langsung ke API
/>

<CloseConfirmationSheet
  isOpen={showCloseConfirmation}
  summary={{
    alamat,
    deviceName,
    rca: selectedRca,
    subRca: selectedSubRca,
    detailPerbaikan,
    photoCount,
  }}
  loading={loadingClose}
  onCancel={() => setShowCloseConfirmation(false)}
  onConfirm={() => {
    setShowCloseConfirmation(false);
    handleCloseTicket(); // ← fungsi ASLI yang sudah ada, dipanggil persis sama seperti sebelumnya, tanpa modifikasi
  }}
/>
```

**`handleCloseTicket` (fungsi existing yang memanggil API close ticket) — nol perubahan.** Yang berubah cuma: siapa yang memanggilnya, dan kapan (setelah konfirmasi eksplisit, bukan langsung dari tombol footer).

### E.3 Isi Sheet

```
┌─────────────────────────────────┐
│ Ringkasan Sebelum Ditutup         │
│                                    │
│ 📍 {alamat}                       │
│ 📡 {deviceName}                   │
│ 🔧 RCA: {rca} — {subRca}          │
│ 📝 "{detailPerbaikan}"            │
│ 📷 {photoCount} foto terlampir    │
│                                    │
│ [ ← Ada yang perlu diubah ]       │
│ [ ✓ Ya, Tutup Ticket Sekarang ]   │
└─────────────────────────────────┘
```
Tombol "Ada yang perlu diubah" cukup menutup sheet (`onCancel`) — teknisi kembali ke form yang **datanya masih utuh** (karena state tidak direset, cuma sheet-nya yang ditutup).

### E.4 Kenapa Aman

- `handleCloseTicket` (mutasi API) dipanggil **persis sama** seperti sekarang — cuma titik pemicunya dipindah dari klik langsung jadi klik-lalu-konfirmasi.
- Kalau teknisi batal di sheet, tidak ada state yang hilang — form tetap seperti sebelum sheet dibuka.
- Komponen baru, tidak ada modifikasi ke komponen manapun yang sudah ada, kecuali satu baris `onClose` prop di `ModalFooter` (diarahkan ke `setShowCloseConfirmation(true)` alih-alih langsung `handleCloseTicket`).

---

## Non-Goals — Yang Sengaja Tidak Disentuh

Supaya eksplisit sesuai instruksi Anda ("jangan sampai mengganggu sistem yang sudah ada"), berikut yang **secara sadar tidak diubah** oleh PRD ini:

- Validasi `canClose` (6 kondisi existing) — tetap satu-satunya gerbang keputusan boleh/tidak close.
- Endpoint API close ticket, update device, geotagging, upload evidence — nol perubahan.
- `DeviceEditor`, `LocationTagger` — struktur internal tidak dibongkar (Fitur B cuma menambah 2 prop opsional ke `AddressEditor`).
- `useRcaSuggestions` — logic pencocokan tidak diubah (Fitur C cuma reorder render).
- Pill checklist di `ModalFooter` — tetap ada, tetap berfungsi seperti sekarang, jadi alternatif navigasi kedua di samping tombol Close yang sekarang juga bisa ditap (Fitur A).
- Tab Evidence, tab Riwayat — tidak disentuh sama sekali oleh PRD ini.

---

## Rollout & Verifikasi

| Fase | Scope | Cara verifikasi aman |
|---|---|---|
| Fase 1 | Fitur A (tombol Close bisa navigasi) | Test manual: ticket dengan berbagai kombinasi field kosong, pastikan tap tombol navigasi ke section yang benar, dan **pastikan close ticket sungguhan masih butuh semua syarat terpenuhi** (coba tap saat canClose true vs false) |
| Fase 2 | Fitur C (elevasi RCA chips) | Bandingkan visual sebelum/sesudah, pastikan `onPick` masih mengisi field yang sama persis |
| Fase 3 | Fitur D (template + voice) | Test di browser yang tidak dukung Web Speech API — pastikan tidak error, ikon mikrofon otomatis hilang |
| Fase 4 | Fitur B (alamat+lokasi bridge) | Test dengan Nominatim API dimatikan/lambat (simulasi network throttle) — pastikan alur closing tetap jalan normal tanpa banner saran |
| Fase 5 | Fitur E (layar ringkasan) | **Paling penting divalidasi**: pastikan `handleCloseTicket` yang dipanggil dari tombol konfirmasi di sheet 100% fungsinya sama seperti saat dipanggil langsung dari footer sebelumnya — tidak ada parameter yang hilang/berubah |

**Feature flag tunggal untuk seluruh redesign:** `TEKNISI_CLOSING_REDESIGN_ENABLED` — kalau di-set `false`, seluruh 5 fitur di atas non-aktif dan UI kembali 100% ke perilaku lama (berguna sebagai rollback cepat kalau ada masalah tak terduga di lapangan).

---

## Ringkasan Perubahan Kode

- `app/teknisi/components/detail-modal/ModalFooter.tsx` — Fitur A (perluas `getCloseContent`, ubah `disabled`/`onClick` tombol Close)
- `app/teknisi/components/detail-modal/AddressEditor.tsx` — Fitur B (2 prop opsional baru)
- `app/teknisi/components/TicketDetailModal.tsx` — integrasi Fitur B (reverse-geocode bridge), Fitur C (reorder render RCA), Fitur D (mount `QuickReplyChips`), Fitur E (mount `CloseConfirmationSheet`, ubah target `onClose` di `ModalFooter`)
- `app/teknisi/components/detail-modal/QuickReplyChips.tsx` — baru (Fitur D)
- `app/teknisi/components/detail-modal/CloseConfirmationSheet.tsx` — baru (Fitur E)
- `ecosystem.config.js` — tambah `TEKNISI_CLOSING_REDESIGN_ENABLED`

Semua perubahan di atas sudah cukup presisi (nama file, potongan kode sebelum/sesudah) untuk langsung dijadikan prompt eksekusi ke OpenCode/Codex CLI per fase.
