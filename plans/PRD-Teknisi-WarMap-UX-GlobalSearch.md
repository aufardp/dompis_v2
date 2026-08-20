# PRD — War Map Viewer Teknisi, Penyempurnaan UX Teknisi & Global Search Ticket/Service_No
**Produk:** Dompis v2 — Telkom Akses Area 3 (Suramadu)
**Versi Dokumen:** 1.0
**Disusun:** berdasarkan audit langsung codebase terbaru (`app`, `lib`) — War Map, KML Import, dan seluruh modul teknisi
**Status:** Belum ada implementasi — 3 fitur net-new, dirancang untuk dieksekusi lewat OpenCode/Codex CLI

---

## 0. Ringkasan Audit — Temuan Kunci

Sebelum masuk ke tiap fitur, ini fakta konkret dari audit yang **langsung membentuk desain di bawah**:

| # | Temuan | Dampak |
|---|---|---|
| 1 | Halaman teknisi (`TeknisiLayout`) **tidak punya bottom navigation** — cuma header (logo, attendance pill, connection status, theme toggle, user menu) + satu halaman dashboard (`TeknisiDashboard.tsx`) berisi list ticket. Navigasi ke `/teknisi/attendance`, `/teknisi/profile` terjadi lewat redirect otomatis/UserMenu, bukan tab persisten. | Menambah War Map & Global Search butuh entry point baru yang tidak mengandalkan bottom nav yang belum ada — saya rancang lewat header icon (§2.3) |
| 2 | Search bar **sudah ada** di `TeknisiDashboard.tsx`, tapi query-nya lewat `/api/tickets` yang di service layer (`buildWorkzoneWhere`, `tickets.service.ts`) **secara eksplisit membatasi role teknisi ke ticket yang assigned ke dirinya** (`assigned_to: userId` via `ticket_assignment_history`, dengan aturan "assigned/on_progress hanya hari ini, pending/close semua histori") | Ini persis batasan yang Anda ingin hilangkan di Fitur 3 — bukan bug, memang didesain scoped, jadi Fitur 3 butuh **jalur baru**, bukan mengubah jalur ini (supaya dashboard utama tidak ikut berubah perilaku) |
| 3 | **Akses detail ticket juga dibatasi kepemilikan** — `ticketDetail.service.ts`, fungsi `canAccessTicket()`: untuk role teknisi, `return ticket.teknisi_user_id === actor.id_user` — tegas, tanpa pengecualian. Bahkan kalau teknisi tahu ID ticket, endpoint detail akan menolak kalau bukan miliknya. | 🔴 **Ini bagian paling kritis dari seluruh PRD ini** — Fitur 3 butuh jalur *read-only* baru yang sengaja melewati batas ini, tapi **wajib tidak menyentuh sedikit pun** endpoint mutasi (close ticket, edit device, geotagging, upload evidence) yang harus **tetap** menolak ticket yang bukan miliknya. Desain detailnya di §3.4. |
| 4 | War Map (`/admin/tools/war-map`) sudah lengkap: `WarMapClient.tsx`, Layer Manager KML, Measure Tool. RBAC-nya memakai pola **array role lokal bernama `WAR_MAP_ROLES`, dideklarasikan ulang independen di 7 file API route berbeda** (`kml-layers/route.ts`, `kml-layers/workzones/route.ts`, `kml-layers/[id]/geojson/route.ts`, `kml-layers/status/route.ts`, `filters/route.ts`, `points/route.ts`, `points/[id]/history/route.ts`) — **tidak ada `'teknisi'` di manapun**. | Fitur 1 butuh edit ke 7 file ini secara presisi — saya list lengkap di §1.4 |
| 5 | Kontrol *manage* (upload/hapus KML) di War Map **sudah** dipisah lewat flag `canManage` yang dihitung **di server** (`isRootRole = ['admin','superadmin','super_admin'].includes(user.role)`), dikirim ke `LayerManagerPanel` sebagai prop. Endpoint upload (`preview`, `run`) dan hapus (`[id]` DELETE) **sudah** `protectApi(['admin','superadmin','super_admin'])`-only, terpisah dari `WAR_MAP_ROLES`. | 🟢 Kabar baik — begitu `'teknisi'` ditambahkan ke `WAR_MAP_ROLES` (baca-saja), **tidak ada risiko** teknisi tiba-tiba bisa import KML, karena endpoint upload/hapusnya memang sudah terpisah total dan tidak disentuh sama sekali oleh perubahan ini. Permintaan #1 Anda ("teknisi tidak bisa import KML") **otomatis terpenuhi** oleh arsitektur yang sudah ada, bukan perlu proteksi tambahan baru. |
| 6 | `WarMapClient.tsx` **minim treatment responsif** (cuma 3 penggunaan breakpoint di 1600+ baris) — dirancang untuk desktop admin, belum dioptimasi mobile. | Menaruh War Map begitu saja untuk teknisi (yang 100% mobile) tanpa penyesuaian akan terasa sempit/menyusahkan — Fitur 2 mencakup penyesuaian ini sebagai bagian tidak terpisahkan dari Fitur 1 |
| 7 | Halaman War Map admin dibungkus `AdminLayout` (shell sidebar desktop) — **tidak kompatibel** dipakai langsung untuk teknisi yang pakai `TeknisiLayout` (shell mobile, tanpa sidebar). | Butuh route baru `/teknisi/war-map` dengan page shell sendiri, **tapi tetap reuse `WarMapClient` yang sama** (bukan fork/duplikasi komponen) — konsisten dengan pelajaran dari kasus `RekapWorkorderClient` yang sudah benar di-share lintas role |

---

# FITUR 1 — War Map sebagai Viewer untuk Role Teknisi

## 1.1 Tujuan

Teknisi bisa membuka War Map dalam mode **lihat-saja** (peta sebaran gangguan, layer KML topologi ODC/ODP yang sudah diimpor admin) — membantu mereka memahami konteks lokasi kerja sebelum berangkat, tanpa kemampuan mengunggah/menghapus skema KML.

## 1.2 Non-Goals

- Teknisi **tidak** bisa upload, edit, atau hapus layer KML (dijamin oleh arsitektur existing, §0 poin 5).
- Teknisi **tidak** bisa mengubah visibilitas default sublayer untuk semua user (`default_visible` di level admin) — hanya toggle tampilan personal saat sedang melihat peta (state lokal browser, tidak tersimpan ke server).
- Tidak ada perubahan pada endpoint import/hapus KML apa pun.

## 1.3 Desain Route & Layout

**Route baru:** `/teknisi/war-map`

```
app/teknisi/war-map/
├── page.tsx                    ← BARU, dibungkus TeknisiLayout (bukan AdminLayout)
└── TeknisiWarMapPageClient.tsx ← BARU, wrapper tipis yang me-render <WarMapClient> yang SAMA
```

`page.tsx`:
```tsx
export const dynamic = 'force-dynamic';

import TeknisiLayout from '../layout'; // atau reuse otomatis lewat app/teknisi/war-map/layout.tsx jika Next.js route grouping dipakai
import TeknisiWarMapPageClient from './TeknisiWarMapPageClient';

const warMapEnabled = process.env.WAR_MAP_ENABLED === 'true';

export default function TeknisiWarMapPage() {
  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-lg font-semibold text-(--text-primary)'>War Map</h1>
        <p className='text-xs text-(--text-secondary)'>
          Peta sebaran gangguan &amp; topologi jaringan di sekitar Anda
        </p>
      </div>
      {warMapEnabled ? (
        <TeknisiWarMapPageClient />
      ) : (
        <div className='rounded-2xl border border-dashed border-(--border) bg-(--surface) px-4 py-12 text-center'>
          <p className='text-sm text-(--text-secondary)'>Fitur War Map belum diaktifkan.</p>
        </div>
      )}
    </div>
  );
}
```

> Catatan implementasi: karena `app/teknisi/layout.tsx` sudah otomatis membungkus semua route di bawah `/teknisi/*` (Next.js App Router nested layout), `page.tsx` di atas **otomatis** mendapat `TeknisiLayout` tanpa perlu import manual — cukup taruh file di path yang benar. Sesuaikan contoh di atas kalau struktur nested layout Anda berbeda.

**`TeknisiWarMapPageClient.tsx`** — **reuse langsung `WarMapClient` yang sudah ada** (`app/admin/tools/war-map/components/WarMapClient.tsx`), bukan komponen baru:
```tsx
'use client';
import WarMapClient from '@/app/admin/tools/war-map/components/WarMapClient';

export default function TeknisiWarMapPageClient() {
  return <WarMapClient />;
}
```
Karena `canManage` dan seluruh RBAC War Map **sudah dihitung di server** berdasarkan role user yang login (§0 poin 5), `WarMapClient` **tidak perlu tahu** dia sedang dirender untuk teknisi atau admin — dia otomatis tampil dalam mode viewer begitu API mengembalikan `canManage: false`untuk role teknisi. Ini keuntungan besar dari desain RBAC server-side yang sudah benar di kode Anda — Fitur 1 secara teknis **jauh lebih sederhana** dari yang mungkin terlihat.

## 1.4 Perubahan RBAC — 7 File, Perubahan Identik di Tiap File

Tambahkan `'teknisi'` ke array `WAR_MAP_ROLES` (atau array inline `protectApi([...])`) di **masing-masing** file berikut. Pola perubahannya sama di semua file — cari deklarasi array role, tambahkan satu baris:

```ts
// SEBELUM (pola yang berulang di 7 file, contoh dari kml-layers/route.ts)
const WAR_MAP_ROLES = [
  'admin',
  'helpdesk',
  'superadmin',
  'super_admin',
  'senior_leader',
  'admin_branch',
];

// SESUDAH
const WAR_MAP_ROLES = [
  'admin',
  'helpdesk',
  'superadmin',
  'super_admin',
  'senior_leader',
  'admin_branch',
  'teknisi',
];
```

Daftar file (semua di `app/api/war-map/`):
1. `kml-layers/route.ts`
2. `kml-layers/workzones/route.ts`
3. `kml-layers/[id]/geojson/route.ts`
4. `kml-layers/status/route.ts`
5. `filters/route.ts`
6. `points/route.ts`
7. `points/[serviceLocationId]/history/route.ts`

**Untuk `filters/route.ts` dan `points/route.ts`** — array role-nya inline (bukan konstanta terpisah bernama `WAR_MAP_ROLES`, tapi langsung di dalam `protectApi([...])`), jadi cari pola:
```ts
const user = await protectApi([
  'admin',
  'helpdesk',
  'superadmin',
  ...
]);
```
dan tambahkan `'teknisi',` di dalam array yang sama.

**JANGAN sentuh** 3 file berikut (memang harus tetap admin-only, ini yang menjamin §1.2):
- `kml-layers/preview/route.ts`
- `kml-layers/run/route.ts`
- `kml-layers/[id]/route.ts` (PATCH/DELETE)

## 1.5 Middleware

Route `/teknisi/war-map` otomatis tercakup oleh matcher `/teknisi/:path*` yang sudah ada di `middleware.ts`, dengan aturan role guard existing (`pathname.startsWith('/teknisi') && userRole !== 'teknisi'`) — **tidak perlu perubahan middleware sama sekali**.

## 1.6 Entry Point di UI Teknisi

Karena tidak ada bottom nav (§0 poin 1), tambahkan **icon peta di header** `TeknisiLayout` (`app/teknisi/layout.tsx`), sejajar dengan tombol tema/connection status yang sudah ada:

```tsx
// Di dalam <div className='flex items-center gap-2'> header, SEBELUM ConnectionStatusIndicator
<button
  onClick={() => router.push('/teknisi/war-map')}
  className='border-border bg-surface-2 hover:bg-surface-3 flex h-10 w-10 items-center justify-center rounded-full border transition-all active:scale-95'
  title='War Map'
  aria-label='Buka War Map'
>
  <MapPin size={17} className='text-text-secondary' />
</button>
```
(`MapPin` dari `lucide-react`, sudah jadi dependency existing — tambahkan ke import di baris atas file bersama `Ticket, Clock, Sun, Moon` yang sudah ada.)

---

# FITUR 2 — UI/UX Teknisi yang Tidak Menyusahkan

Fitur ini bukan satu komponen baru, tapi kumpulan penyesuaian yang menyatu dengan Fitur 1 dan 3 supaya semuanya terasa sebagai satu pengalaman yang koheren, bukan tambalan.

## 2.1 War Map Versi Mobile — Full-Screen dengan Panel Bottom Sheet

`WarMapClient` saat ini pakai layout grid desktop (filter panel di kolom kiri tetap, peta di kanan) — di layar HP ini akan membuat peta jadi sangat sempit. Untuk `/teknisi/war-map` **khususnya** (bukan mengubah versi admin), terapkan pola yang sudah pernah saya usulkan sebelumnya untuk KML Layer Manager, sekarang direalisasikan:

- Peta **full-screen** sebagai elemen utama.
- Filter/Layer panel **disembunyikan default**, dipanggil lewat **floating action button** (ikon layer, pojok kanan-bawah peta) yang membuka **bottom sheet** (bisa di-drag, snap point 40%/90% tinggi layar).
- Karena `WarMapClient` adalah komponen bersama (dipakai admin & teknisi), penyesuaian ini **harus berbasis deteksi ukuran layar (responsive CSS), bukan deteksi role** — supaya kalau suatu saat admin membuka War Map dari HP-nya sendiri, dia juga otomatis dapat pengalaman mobile yang sama baiknya. Ini pendekatan yang lebih tahan lama dibanding membuat versi terpisah khusus teknisi.
- **Implementasi teknis:** breakpoint Tailwind (`lg:hidden`/`hidden lg:block`) untuk toggle antara layout grid desktop (existing, tidak diubah) vs layout full-screen+FAB+bottom-sheet (baru) — dua render path di komponen yang sama, bukan file terpisah.

## 2.2 Auto-Center Peta ke Konteks Teknisi (Value-Add Kecil, Dampak Terasa)

Saat teknisi membuka War Map dari ticket yang sedang mereka kerjakan (bukan dari header umum), peta otomatis center & zoom ke lokasi ticket itu — bukan tampilan default area luas. Ini butuh War Map bisa menerima parameter posisi awal lewat query string, mis. `/teknisi/war-map?lat=...&lng=...&zoom=16`, dan sebuah tombol "Lihat di War Map" ditambahkan di `TicketDetailModal`/`TicketDetailContent` teknisi (dekat `LocationTagger`, kalau ticket itu sudah pernah ditag lokasinya).

## 2.3 Header Tidak Kepenuhan

Header teknisi sudah cukup padat (logo, attendance pill, connection indicator, theme toggle, user menu). Menambah 2 icon baru (War Map §1.6, Global Search §3.5) berarti total bisa 4-5 elemen berjejer di sebelah kanan pada layar kecil. **Rekomendasi:** kelompokkan icon War Map + Global Search jadi satu tombol "lainnya" (ikon titik tiga / grid) yang membuka small popover berisi kedua pilihan itu, alih-alih menambah lebar header terus-menerus setiap kali ada fitur baru — pola ini juga lebih siap menampung fitur mendatang tanpa header makin sesak.

## 2.4 Konsistensi dengan Prinsip UX Teknisi yang Sudah Dirumuskan Sebelumnya

Poin-poin dari PRD sebelumnya (alur gabungan Alamat+Lokasi, riwayat bank data per `service_no`, resiliensi offline) tetap berlaku dan **tidak berubah** oleh dua fitur baru ini — saya sebutkan di sini murni sebagai pengingat konsistensi desain, bukan pekerjaan baru.

---

# FITUR 3 — Global Search Ticket & Service_No untuk Teknisi

## 3.1 Tujuan

Teknisi bisa mencari **ticket apa pun** di seluruh sistem (bukan cuma yang assigned ke dirinya) berdasarkan nomor ticket, incident, atau `service_no`, dan melihat detailnya — **hanya untuk melihat**, tidak untuk mengedit/menutup ticket yang bukan miliknya.

**Kasus pemakaian nyata:** pelanggan menelepon teknisi langsung (bukan lewat helpdesk) menanyakan status gangguan yang ditangani teknisi lain, atau teknisi ingin cek riwayat `service_no` sebelum berangkat ke lokasi yang mungkin pernah ditangani rekan lain.

## 3.2 🔴 Prinsip Keamanan yang Wajib Dipegang (baca sebelum implementasi apa pun)

1. **Baca ≠ Tulis.** Fitur ini HANYA menambah kemampuan *melihat*. Setiap endpoint mutasi yang sudah ada (`close ticket`, `update device`, `location tagging`, `upload evidence`, dst) **tidak boleh disentuh sama sekali** — semuanya tetap memakai `canAccessTicket()` yang sudah ketat (`teknisi_user_id === actor.id_user`).
2. **Jangan modifikasi `canAccessTicket()` yang sudah ada.** Godaan paling gampang (dan paling berbahaya) adalah menambah exception di fungsi ini — **jangan**. Buat jalur terpisah (§3.4) supaya perubahan Fitur 3 mustahil secara tidak sengaja melonggarkan endpoint lain yang memanggil fungsi yang sama.
3. **UI wajib menandai jelas kalau ticket sedang dilihat bukan milik teknisi** — bukan cuma menyembunyikan tombol aksi, tapi ada banner eksplisit "Mode Lihat — Ticket ini ditangani teknisi lain" supaya tidak ada ambiguitas.

## 3.3 Data Model

**Tidak ada tabel baru.** Fitur ini murni menambah *mode query* baru di layer service yang sudah ada.

## 3.4 Arsitektur — Endpoint Terpisah, Bukan Mengubah yang Lama

### 3.4a Endpoint Search Baru: `GET /api/tickets/global-search`

```ts
// app/api/tickets/global-search/route.ts — BARU
export async function GET(request: Request) {
  const rateLimited = await enforceApiRateLimit(request, {
    namespace: 'ticket-global-search',
    limit: 30,        // lebih ketat dari search biasa — ini akses lintas-scope, wajar dibatasi lebih hati-hati
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  const user = await protectApi(['teknisi']); // HANYA teknisi — admin/helpdesk sudah punya jalur pencarian sendiri di dashboard masing-masing, tidak perlu endpoint ini

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  if (query.length < 3) {
    return NextResponse.json({ success: true, data: { data: [], total: 0 } });
  }

  const result = await TicketService.globalSearchForTeknisi(query, {
    page: toPositiveInt(searchParams.get('page'), 1, 100),
    limit: 20, // dikunci kecil, ini pencarian cepat bukan listing halaman penuh
  });

  return NextResponse.json({ success: true, data: result });
}
```

**Kenapa `limit: 20` mutlak, bukan dari query param seperti endpoint lain?** Supaya tidak ada celah untuk "menyamarkan" full-listing seluruh database ticket lewat parameter `limit` besar dengan query kosong/generik — endpoint ini murni untuk pencarian spesifik (butuh minimal 3 karakter), bukan browsing.

### 3.4b Method Baru di Service: `TicketService.globalSearchForTeknisi()`

Di `app/libs/services/tickets.service.ts`, tambahkan method baru (**jangan modifikasi `getTickets`/`buildTicketWhere` yang sudah ada**):

```ts
static async globalSearchForTeknisi(
  query: string,
  pagination: { page: number; limit: number },
) {
  const searchWhere = buildTicketSearchWhere(query, undefined); // reuse fungsi search existing, ini aman karena hanya membangun kondisi WHERE pencarian teks, tidak terkait scoping kepemilikan
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const [total, tickets] = await Promise.all([
    prisma.ticket.count({ where: searchWhere }),
    prisma.ticket.findMany({
      where: searchWhere,
      orderBy: [{ reported_date: 'desc' }],
      skip: offset,
      take: limit,
      select: {
        id_ticket: true,
        incident: true,
        service_no: true,
        customer_name: true,
        workzone: true,
        status: true,
        status_update: true,
        teknisi_user_id: true,
        reported_date: true,
        users: { select: { nama: true } }, // nama teknisi yang menangani, untuk ditampilkan di hasil pencarian
      },
    }),
  ]);

  return {
    data: tickets,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
```

Perhatikan: **tidak ada pemanggilan `buildWorkzoneWhere` atau filter `teknisi_user_id`** di method ini — sengaja, karena inilah yang membuatnya "global". Method ini **terpisah total** dari `getTickets()` yang dipakai dashboard utama, jadi tidak ada risiko efek samping ke situ.

### 3.4c Endpoint Detail Read-Only: Perluasan `canAccessTicket`, Bukan Penggantian

Ini bagian paling sensitif. **Jangan ubah `canAccessTicket()`.** Sebagai gantinya, `getTicketDetailForActor` diberi parameter opsional baru:

```ts
// ticketDetail.service.ts
export async function getTicketDetailForActor(
  ticketId: number,
  actor: TicketDetailActor,
  options?: { allowGlobalReadOnly?: boolean }, // BARU, default undefined/false
): Promise<(Ticket & { isReadOnlyView?: boolean }) | null> {
  const row = await prisma.ticket.findUnique({ /* ...existing... */ });
  if (!row) return null;

  const hasOwnedAccess = await canAccessTicket(row, actor); // FUNGSI LAMA, TIDAK DIUBAH SAMA SEKALI

  if (!hasOwnedAccess) {
    // Hanya izinkan lewat jika caller EKSPLISIT minta mode read-only DAN actor adalah teknisi
    if (!(options?.allowGlobalReadOnly && actor.role === 'teknisi')) {
      return null; // perilaku LAMA persis, tidak berubah untuk semua caller lain
    }
    // lanjut ke bawah, tapi ticket ini akan ditandai read-only
  }

  // ...proses assembling detail ticket seperti sebelumnya (tracking, activity log, dst)...

  return {
    ...assembledTicket,
    isReadOnlyView: !hasOwnedAccess, // flag baru, dikonsumsi frontend untuk sembunyikan semua kontrol edit
  };
}
```

**Endpoint yang memanggil dengan `allowGlobalReadOnly: true` HANYA SATU** — endpoint baru khusus:

```ts
// app/api/tickets/[id]/global-detail/route.ts — BARU, TERPISAH dari /api/tickets/[id]/detail yang lama
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rateLimited = await enforceApiRateLimit(req, {
    namespace: 'ticket-global-detail',
    limit: 30,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  const user = await protectApi(['teknisi']); // hanya teknisi
  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isFinite(ticketId) || ticketId <= 0) {
    return NextResponse.json({ success: false, message: 'Invalid ticket id' }, { status: 400 });
  }

  const ticket = await getTicketDetailForActor(ticketId, user, { allowGlobalReadOnly: true });
  if (!ticket) {
    return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: ticket });
}
```

**Endpoint lama `/api/tickets/[id]/detail/route.ts` sama sekali tidak diubah** — tetap memanggil `getTicketDetailForActor(ticketId, user)` tanpa `options`, jadi perilakunya identik seperti sebelum PRD ini ada. Ini pemisahan yang disengaja: dua endpoint, dua tujuan, nol risiko saling mempengaruhi.

## 3.5 UI/UX

### 3.5a Entry Point

Icon kaca pembesar di header (bergabung dalam popover "lainnya" bersama War Map, §2.3), membuka halaman/modal pencarian terpisah dari search bar dashboard existing — **penting dipisah secara visual**, supaya teknisi tidak bingung antara "cari di ticket saya" (search bar dashboard, sudah ada) vs "cari ticket siapa saja" (fitur baru ini).

### 3.5b Halaman Pencarian

```
┌─────────────────────────────────────┐
│ ← Pencarian Global                   │
│                                       │
│ 🔍 [Cari nomor ticket / service_no] │
│                                       │
│ ℹ️ Pencarian ini mencakup SEMUA      │
│    ticket, bukan cuma milik Anda     │
│                                       │
│ Hasil (12):                          │
│ ┌───────────────────────────────┐   │
│ │ INC-2026-08-001234             │   │
│ │ 123456789012 · Jl. Contoh...   │   │
│ │ 🔧 Ditangani: Budi S.          │   │
│ │ 🟡 On Progress                 │   │
│ └───────────────────────────────┘   │
│ ┌───────────────────────────────┐   │
│ │ ...                             │   │
└─────────────────────────────────────┘
```
Setiap hasil pencarian menampilkan **siapa yang menangani** (`users.nama` dari query §3.4b) — ini penting secara UX: teknisi langsung tahu ticket itu bukan miliknya sebelum bahkan membuka detailnya.

### 3.5c Tampilan Detail Read-Only

Reuse `TicketDetailModal`/`TicketDetailContent` yang sudah ada, dengan prop baru `readOnly?: boolean` (diisi dari `ticket.isReadOnlyView` hasil API §3.4c):

- **Banner kuning di paling atas modal**: `👁️ Mode Lihat — Ticket ini ditangani oleh {nama teknisi lain}. Anda tidak dapat mengubah data ticket ini.`
- **`ModalFooter`** (tombol close ticket) — disembunyikan total, bukan di-disable (mengurangi kebingungan "kenapa tombolnya abu-abu").
- **`DeviceEditor`, `AddressEditor`, `LocationTagger`** — dirender dalam mode tampilan-saja (tanpa tombol edit), reuse "filled state" yang sudah ada di komponen-komponen itu (state ini sudah dirancang non-interaktif sejak awal untuk kasus lain, tinggal dipaksa aktif lewat prop `readOnly`).
- Tombol **"Hubungi Teknisi Penanggung Jawab"** (opsional, nice-to-have) — kalau nomor telepon teknisi tersedia di data user, tampilkan tombol call/WA langsung — mendukung skenario nyata di §3.1 (koordinasi antar teknisi).

## 3.6 Rollout

| Fase | Scope |
|---|---|
| Fase 1 | `globalSearchForTeknisi()` di service + endpoint `global-search` |
| Fase 2 | Perluasan `getTicketDetailForActor` (opsional param, §3.4c) + endpoint `global-detail` — **verifikasi endpoint lama tidak berubah perilaku** sebelum lanjut |
| Fase 3 | UI halaman pencarian global |
| Fase 4 | Mode `readOnly` di `TicketDetailModal`/`TicketDetailContent` + komponen editor turunannya |

Feature flag: `TEKNISI_GLOBAL_SEARCH_ENABLED`.

---

## Ringkasan Perubahan Kode (untuk eksekusi OpenCode)

**Fitur 1 — War Map Viewer:**
- `app/teknisi/war-map/page.tsx` — baru
- `app/teknisi/war-map/TeknisiWarMapPageClient.tsx` — baru
- `app/teknisi/layout.tsx` — tambah icon War Map di header
- 7 file `app/api/war-map/*` — tambah `'teknisi'` ke role array (daftar lengkap §1.4)

**Fitur 2 — UX:**
- `app/admin/tools/war-map/components/WarMapClient.tsx` — tambah render path mobile (FAB + bottom sheet) berbasis breakpoint, tambah dukungan query param `lat`/`lng`/`zoom` untuk auto-center
- `app/teknisi/components/TicketDetailContent.tsx` (atau modal terkait) — tombol "Lihat di War Map" dekat LocationTagger
- `app/teknisi/layout.tsx` — popover "lainnya" untuk mengelompokkan icon baru

**Fitur 3 — Global Search:**
- `app/libs/services/tickets.service.ts` — tambah method `globalSearchForTeknisi()`
- `app/api/tickets/global-search/route.ts` — baru
- `app/libs/services/ticketDetail.service.ts` — tambah parameter opsional `allowGlobalReadOnly`
- `app/api/tickets/[id]/global-detail/route.ts` — baru
- `app/teknisi/components/TicketDetailModal.tsx` + `TicketDetailContent.tsx` — tambah prop `readOnly`, banner, sembunyikan `ModalFooter`
- Halaman/komponen pencarian global baru (lokasi persis menyesuaikan struktur routing yang Anda pilih — halaman terpisah `/teknisi/search` atau modal overlay dari header)

**Semua fitur:** tambahkan feature flag terkait ke `ecosystem.config.js` (`TEKNISI_WAR_MAP_ENABLED` kalau ingin independen dari `WAR_MAP_ENABLED` utama, `TEKNISI_GLOBAL_SEARCH_ENABLED`).

Dokumen ini sudah cukup detail untuk langsung dijadikan prompt eksekusi per-fase ke OpenCode/Codex CLI — beri tahu saya kalau ingin saya susun jadi prompt siap-pakai per fase.
