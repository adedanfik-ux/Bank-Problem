/**
 * Bank Problem & Countermeasure — server sinkron (Google Apps Script)
 * ------------------------------------------------------------------
 * Pasang sebagai script yang TERIKAT ke Google Sheet:
 *   1. Buat Google Sheet kosong → Extensions → Apps Script.
 *   2. Hapus isi Code.gs, tempel seluruh file ini, Save.
 *   3. Pilih fungsi setupAwal → Run → izinkan akses (Sheets + Drive).
 *   4. Deploy → New deployment → type Web app
 *        Execute as : Me
 *        Who has access : Anyone
 *      → Deploy → salin "Web app URL" (berakhiran /exec).
 *   5. Di aplikasi: Data & Backup → Sinkron online → isi URL + Kode akses
 *      (kode akses ada di sheet "Pengaturan", sel B1).
 *
 * Data: sheet "Problems" (1 baris per problem). Foto: folder Drive "Bank Problem - Foto".
 * Konflik: last-writer-wins per record berdasarkan updatedAt.
 * Hapus: record ditandai deleted=1 (tombstone) agar ikut tersinkron ke perangkat lain.
 */

const APP = 'bank-problem';
const SHEET = 'Problems';
const CFG_SHEET = 'Pengaturan';
const COLS = ['id', 'kode', 'tgl', 'status', 'line', 'mesin', 'part', 'proses', 'kategori', 'm4',
  'fenomena', 'detail', 'why1', 'why2', 'why3', 'why4', 'why5', 'rootCause', 'tempCM', 'permCM',
  'preventive', 'pic', 'due', 'verifikasi', 'tags', 'photos', 'history', 'createdAt', 'updatedAt',
  'deleted', 'device', 'syncedAt'];
const C = COLS.reduce(function (m, c, i) { m[c] = i; return m; }, {});
const MAX_CELL = 49000;
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/* ================= SETUP (jalankan manual dari editor) ================= */

function setupAwal() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold').setBackground('#1b2a4a').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange(1, 1, sh.getMaxRows(), COLS.length).setNumberFormat('@');

  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('SECRET');
  if (!secret) { secret = newSecret_(); props.setProperty('SECRET', secret); }

  let fid = props.getProperty('FOLDER_ID');
  if (!fid || !folderExists_(fid)) {
    fid = DriveApp.createFolder('Bank Problem - Foto').getId();
    props.setProperty('FOLDER_ID', fid);
  }
  writeCfg_(secret, fid);
  Logger.log('Setup selesai. Kode akses: ' + secret);
}

/** Ganti kode akses (semua perangkat harus diisi ulang dengan kode baru). */
function gantiKodeAkses() {
  const props = PropertiesService.getScriptProperties();
  const secret = newSecret_();
  props.setProperty('SECRET', secret);
  writeCfg_(secret, props.getProperty('FOLDER_ID'));
  Logger.log('Kode akses baru: ' + secret);
}

function newSecret_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }
function folderExists_(id) { try { DriveApp.getFolderById(id).getName(); return true; } catch (e) { return false; } }
function writeCfg_(secret, fid) {
  const ss = SpreadsheetApp.getActive();
  const cfg = ss.getSheetByName(CFG_SHEET) || ss.insertSheet(CFG_SHEET);
  cfg.clear();
  cfg.getRange(1, 1, 4, 2).setNumberFormat('@').setValues([
    ['Kode akses (isi di aplikasi)', secret],
    ['Folder foto (Drive)', fid ? 'https://drive.google.com/drive/folders/' + fid : '-'],
    ['Catatan', 'Jangan bagikan kode akses di luar tim. Untuk mengganti: jalankan fungsi gantiKodeAkses.'],
    ['Diperbarui', new Date().toISOString()]
  ]);
  cfg.getRange('A1:A4').setFontWeight('bold');
  cfg.setColumnWidth(1, 230); cfg.setColumnWidth(2, 460);
}

/* ================= WEB APP ================= */

function doGet() { return out_({ ok: true, app: APP, message: 'Bank Problem sync endpoint aktif' }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret) return out_({ ok: false, error: 'not_setup' });
  if (!req || req.token !== secret) return out_({ ok: false, error: 'unauthorized' });
  try {
    switch (req.action) {
      case 'ping': return out_({ ok: true, app: APP, serverTime: new Date().toISOString(), rows: Math.max(0, sheet_().getLastRow() - 1) });
      case 'push': return out_(push_(req));
      case 'pull': return out_(pull_(req));
      case 'uploadPhoto': return out_(uploadPhoto_(req));
      case 'getPhoto': return out_(getPhoto_(req));
      default: return out_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return out_({ ok: false, error: 'server_error', message: String((err && err.message) || err) });
  }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ================= DATA ================= */

function sheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  if (!sh) throw new Error('Sheet "' + SHEET + '" belum ada. Jalankan setupAwal.');
  return sh;
}
function readAll_(sh) {
  const n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, COLS.length).getDisplayValues();
}
function cell_(v) {
  if (v == null) return '';
  let s = String(v);
  if (s.length > MAX_CELL) s = s.slice(0, MAX_CELL);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // cegah teks dibaca sebagai formula
  return s;
}
function toRow_(r, now, device) {
  const why = Array.isArray(r.why) ? r.why : [];
  const m = {
    id: r.id, kode: r.kode, tgl: r.tgl, status: r.status, line: r.line, mesin: r.mesin, part: r.part,
    proses: r.proses, kategori: r.kategori, m4: r.m4, fenomena: r.fenomena, detail: r.detail,
    why1: why[0], why2: why[1], why3: why[2], why4: why[3], why5: why[4],
    rootCause: r.rootCause, tempCM: r.tempCM, permCM: r.permCM, preventive: r.preventive, pic: r.pic,
    due: r.due, verifikasi: r.verifikasi, tags: r.tags,
    photos: (Array.isArray(r.photos) ? r.photos : []).filter(function (p) { return ID_RE.test(p); }).join(','),
    history: JSON.stringify(Array.isArray(r.history) ? r.history.slice(-50) : []),
    createdAt: r.createdAt, updatedAt: r.updatedAt, deleted: r.deleted ? '1' : '',
    device: r.device || device || '', syncedAt: now
  };
  return COLS.map(function (c) { return cell_(m[c]); });
}
function fromRow_(row) {
  let hist = [];
  try { hist = row[C.history] ? JSON.parse(row[C.history]) : []; } catch (e) { hist = []; }
  return {
    id: row[C.id], kode: row[C.kode], tgl: row[C.tgl], status: row[C.status], line: row[C.line], mesin: row[C.mesin],
    part: row[C.part], proses: row[C.proses], kategori: row[C.kategori], m4: row[C.m4], fenomena: row[C.fenomena],
    detail: row[C.detail], why: [row[C.why1], row[C.why2], row[C.why3], row[C.why4], row[C.why5]],
    rootCause: row[C.rootCause], tempCM: row[C.tempCM], permCM: row[C.permCM], preventive: row[C.preventive],
    pic: row[C.pic], due: row[C.due], verifikasi: row[C.verifikasi], tags: row[C.tags],
    photos: row[C.photos] ? row[C.photos].split(',') : [], history: hist,
    createdAt: row[C.createdAt], updatedAt: row[C.updatedAt], deleted: row[C.deleted] === '1',
    device: row[C.device], syncedAt: row[C.syncedAt]
  };
}
function nextKode_(kode, kodes) {
  const pre = String(kode).replace(/\d+$/, '');
  let max = 0;
  Object.keys(kodes).forEach(function (k) {
    if (k.indexOf(pre) === 0) { const n = parseInt(k.slice(pre.length), 10); if (n > max) max = n; }
  });
  return pre + ('00' + (max + 1)).slice(-Math.max(3, String(max + 1).length));
}

function push_(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = sheet_();
    const data = readAll_(sh);
    const idx = {}, kodes = {};
    data.forEach(function (row, i) { idx[row[C.id]] = i; if (row[C.kode]) kodes[row[C.kode]] = row[C.id]; });
    const now = new Date().toISOString();
    const applied = [], stale = [], renamed = {}, appends = [], updates = [];
    const seen = {};
    (req.records || []).forEach(function (r) {
      if (!r || !ID_RE.test(r.id || '') || seen[r.id]) return;
      seen[r.id] = true;
      const i = idx[r.id];
      if (i != null) {
        const cur = data[i][C.updatedAt] || '';
        const inc = r.updatedAt || '';
        if (inc < cur) { stale.push(r.id); return; }
        if (inc === cur && data[i][C.deleted] === (r.deleted ? '1' : '')) { applied.push(r.id); return; }
        r.kode = data[i][C.kode] || r.kode; // kode yang sudah terdaftar di server tidak berubah
        data[i] = toRow_(r, now, req.device);
        updates.push(i);
      } else {
        if (!r.kode || (kodes[r.kode] && kodes[r.kode] !== r.id)) {
          const nk = nextKode_(r.kode || 'PC-0000-', kodes);
          renamed[r.id] = nk; r.kode = nk;
        }
        kodes[r.kode] = r.id;
        appends.push(toRow_(r, now, req.device));
      }
      if (r.deleted) trashPhotos_(r.photos);
      applied.push(r.id);
    });
    if (updates.length > 15) {
      sh.getRange(2, 1, data.length, COLS.length).setNumberFormat('@').setValues(data);
    } else {
      updates.forEach(function (i) { sh.getRange(i + 2, 1, 1, COLS.length).setNumberFormat('@').setValues([data[i]]); });
    }
    if (appends.length) {
      sh.getRange(sh.getLastRow() + 1, 1, appends.length, COLS.length).setNumberFormat('@').setValues(appends);
    }
    return { ok: true, applied: applied, stale: stale, renamed: renamed, serverTime: now };
  } finally {
    lock.releaseLock();
  }
}

function pull_(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const now = new Date().toISOString();
    const since = req.since || '';
    const want = {};
    (req.ids || []).forEach(function (id) { want[id] = true; });
    const recs = readAll_(sheet_())
      .filter(function (r) { return r[C.id] && (!since || r[C.syncedAt] >= since || want[r[C.id]]); })
      .map(fromRow_);
    return { ok: true, records: recs, serverTime: now };
  } finally {
    lock.releaseLock();
  }
}

/* ================= FOTO ================= */

function folder_() {
  const id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) throw new Error('Folder foto belum ada. Jalankan setupAwal.');
  return DriveApp.getFolderById(id);
}
function uploadPhoto_(req) {
  if (!ID_RE.test(req.id || '')) return { ok: false, error: 'bad_id' };
  if (!req.data) return { ok: false, error: 'no_data' };
  const f = folder_();
  const name = req.id + '.jpg';
  if (f.getFilesByName(name).hasNext()) return { ok: true, id: req.id, existed: true };
  const type = /^image\/(jpeg|png|webp|gif)$/.test(req.type || '') ? req.type : 'image/jpeg';
  f.createFile(Utilities.newBlob(Utilities.base64Decode(req.data), type, name));
  return { ok: true, id: req.id };
}
function getPhoto_(req) {
  if (!ID_RE.test(req.id || '')) return { ok: false, error: 'bad_id' };
  const it = folder_().getFilesByName(req.id + '.jpg');
  if (!it.hasNext()) return { ok: false, error: 'not_found' };
  const b = it.next().getBlob();
  return { ok: true, id: req.id, type: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
}
function trashPhotos_(ids) {
  try {
    const f = folder_();
    (ids || []).forEach(function (id) {
      if (!ID_RE.test(id)) return;
      const it = f.getFilesByName(id + '.jpg');
      while (it.hasNext()) it.next().setTrashed(true);
    });
  } catch (e) { /* foto gagal dibuang tidak menggagalkan sinkron data */ }
}
