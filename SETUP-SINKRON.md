# Setup sinkron online (Google Sheets + Drive)

Aplikasi tetap jalan offline. Sinkron hanya menambah salinan data di Google Sheet milik Bosku
sehingga bisa dibuka di HP/tablet/laptop lain. Lakukan **sekali** (paling nyaman dari PC, ±5 menit).

## 1. Buat server

1. Buka **sheets.new** → beri nama, mis. `Bank Problem DB`.
2. Menu **Extensions → Apps Script**.
3. Hapus semua isi `Code.gs`, lalu tempel seluruh isi file
   [`server/Code.gs`](https://raw.githubusercontent.com/adedanfik-ux/Bank-Problem/main/server/Code.gs). Klik **Save**.
4. Di dropdown fungsi pilih **setupAwal** → **Run** → **Review permissions** → pilih akun →
   *Advanced → Go to … (unsafe)* → **Allow**. (Peringatan ini normal untuk script buatan sendiri.)
5. Kembali ke Sheet: muncul sheet **Problems** (data) dan **Pengaturan**. **Sel B1 di Pengaturan = Kode akses.**
   Folder **Bank Problem - Foto** otomatis dibuat di Google Drive.

## 2. Deploy sebagai Web App

1. Di Apps Script: **Deploy → New deployment** → ikon ⚙ → **Web app**.
2. *Execute as*: **Me** · *Who has access*: **Anyone** → **Deploy**.
3. Salin **Web app URL** (berakhiran `/exec`).

> "Anyone" diperlukan agar aplikasi di HP bisa menghubungi server tanpa login Google.
> Semua permintaan tetap ditolak tanpa kode akses yang benar.

## 3. Hubungkan aplikasi (di tiap perangkat)

1. Buka aplikasi (sekali saat online agar versi baru termuat) → **Data & Backup**.
2. Bagian **Sinkron online**: isi *URL Web App*, *Kode akses*, *Nama perangkat* (mis. `HP Ade`, `Tablet Line 2`).
3. **Simpan & tes koneksi.** Sinkron pertama mengirim semua data + foto yang sudah ada di HP itu.

Status sinkron tampil di header (titik hijau = tersinkron, kuning = ada yang belum terkirim / offline,
merah = gagal). Ketuk status untuk membuka pengaturan.

## Cara kerja

| Hal | Perilaku |
|---|---|
| Kapan sinkron | Saat aplikasi dibuka, setelah simpan/hapus, saat sinyal kembali, dan tombol *Sinkron sekarang* |
| Offline | Semua input tetap tersimpan di HP; dikirim otomatis begitu online |
| Konflik (record sama diedit di 2 perangkat) | Versi dengan waktu ubah terbaru yang dipakai; riwayat perubahan mencatat perangkatnya |
| Kode PC-YYMM-nnn bentrok (dibuat offline bersamaan) | Server memberi nomor berikutnya ke record yang datang belakangan |
| Hapus | Ditandai `deleted=1` di Sheet (tidak dihapus fisik) dan ikut terhapus di perangkat lain; foto dibuang ke Trash Drive |
| Foto | File `<id>.jpg` di folder Drive; perangkat lain mengunduh saat foto pertama kali dibuka, lalu disimpan untuk offline |

## Update server

Jika `server/Code.gs` berubah: tempel versi baru → **Deploy → Manage deployments → ✏ Edit →
Version: New version → Deploy**. URL tetap sama, perangkat tidak perlu diubah.

## Ganti kode akses

Apps Script → jalankan fungsi **gantiKodeAkses** → kode baru muncul di sheet Pengaturan B1 →
isi ulang di semua perangkat.

## Catatan

- Jangan mengedit kolom `id`, `updatedAt`, `syncedAt`, `history` langsung di Sheet.
  Untuk analisis/rekap, buat sheet lain yang membaca sheet Problems (mis. `=QUERY(Problems!A:AF, …)`).
- Batas praktis: ribuan record. Bila sudah puluhan ribu, pertimbangkan migrasi ke database (MySQL/Firebase).
