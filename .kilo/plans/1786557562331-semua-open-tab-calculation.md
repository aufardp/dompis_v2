# Plan: Sinkronisasi Summary Cards & Sidebar dengan Tab Counts

## Tujuan

User melaporkan mismatch antara angka di tab header dengan angka di tabel/container lain:
1. **Summary cards** (Total, Open, Assigned, Close) di atas tabel harus mengikuti angka tab
2. **Sidebar** bucket count harus juga ikut berubah sesuai

Specifically:
- **Total card** = angka tab "Semua (Open)" = `mergedTotal`
- **Open card** = `mergedSummary.open`
- **Assigned card** = `mergedSummary.assigned`
- **Close card** = `closePageData.pagination.total`
- **Sidebar** = `mergedTotal`

---

## Perubahan di `TicketManagementBucketPage.tsx`

### 1. Update summary cards (line ~1122-1141)

Ganti `totals.total`, `totals.open`, `totals.assigned`, `totals.close` dengan:
- `mergedTotal` untuk Total
- `mergedSummary.open` untuk Open
- `mergedSummary.assigned` untuk Assigned
- `closePageData.pagination.total` untuk Close

```typescript
{[
  ['Total', mergedTotal],
  ['Open', mergedSummary.open],
  ['Assigned', mergedSummary.assigned],
  ['Close', closePageData.pagination.total],
].map(([label, value]) => ( ... ))}
```

### 2. Update sidebar bucket count (line ~869-875)

Ganti `totals.total` dengan `mergedTotal`:
```typescript
useEffect(() => {
  if (navKey && mergedTotal > 0) {
    setBucketCount(navKey, mergedTotal);
  }
}, [navKey, mergedTotal]);
```

---

## Validasi

Setelah perubahan:
- Total card = `mergedTotal` = badge "Semua (Open)" = jumlah baris di tabel Semua
- Open card = `mergedSummary.open` (actual open count dari query dept=all)
- Assigned card = `mergedSummary.assigned` (actual assigned+on_progress+pending count)
- Close card = `closePageData.pagination.total` (all closed tickets)
- Sidebar = `mergedTotal`

Semua angka mengacu ke query yang sama untuk tab "Semua (Open)", sehingga konsisten.

---

## File Terkait

- `app/admin/components/dashboard/TicketManagementBucketPage.tsx` — **satu-satunya file yang diubah**
- `app/libs/bucket-sync-store.ts` — tidak diubah, hanya dipanggil dengan nilai baru

---

## Catatan

`mergedSummary` berasal dari query `semuaPageData` (`dept='all'`) yang menampilkan data di tab "Semua (Open)". Jadi menggunakan `mergedSummary` untuk summary cards memastikan konsistensi antara angka di tab, cards, dan sidebar.