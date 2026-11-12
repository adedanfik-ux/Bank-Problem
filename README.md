# Bank Problem & Countermeasure

Aplikasi offline-first (PWA) untuk mencatat problem lapangan: fenomena, foto, 5 Why, root cause,
countermeasure, PIC, dan verifikasi.

- **Buka / install:** https://adedanfik-ux.github.io/Bank-Problem/
- **Offline:** data tersimpan di HP (IndexedDB), tetap jalan tanpa internet.
- **Sinkron antar perangkat (opsional):** Google Sheets + Drive lewat Apps Script → lihat [SETUP-SINKRON.md](SETUP-SINKRON.md).

Repo ini hanya berisi kode. Data problem tidak pernah disimpan di repo.

| File | Fungsi |
|---|---|
| `index.html` | Aplikasi |
| `sw.js` | Cache offline (naikkan `VERSION` setiap rilis) |
| `manifest.webmanifest`, `icon-*.png` | Identitas aplikasi untuk install |
| `server/Code.gs` | Server sinkron Google Apps Script |
