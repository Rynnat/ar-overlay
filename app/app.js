// Aşama 0: kutu takibi + iç küp overlay, iki poz kaynağı yan yana.
//  - markersız: beyaz kağıt üstündeki koyu kutunun üst yüz karesi -> 4 köşe -> solvePnP (IPPE_SQUARE)
//  - aruco: kutunun oturduğu taban plakasındaki 4 marker (DICT_4X4_50, id 10-13) -> 16 köşe -> solvePnP
// Ölçüm her zaman HAM pozdan; 1€ filtresi yalnız çizimde. "Ölç" modu sabit telefonda titremeyi sayıyla verir.
// Geometri: ../asama0/v2/geometri.json (kutu), ../asama0/v3/geometri_v3.json (taban). mm, iç taban z=0, +z kameraya.

const SURUM = "v1.5";   // her yayında artır; ekranda görünür (doğru sürüm mü kontrolü)

const G = {
  dis: 30,            // kutu dış kenar (kapak da 30)
  ic: 22,             // iç boşluk
  tabanT: 2.5,        // iç tabanın altındaki kalınlık
  duvarUst: 24,       // iç tabandan duvar üstüne
  kapakUst: 26,       // kapak takılıyken üst yüz
  kup: 15,            // küp kenarı, ortada
};
// taban plakası (asama0/v3): marker merkezleri kutu koordinatında, marker üstü +y yönünde
const TABAN = {
  kenar: 35,          // siyah marker kenarı (mm)
  z: -0.55,           // marker yüzeyi: plaka üstü -0.5, 0.2 cep, +0.1 kağıt +0.05 yapıştırıcı (geometri_v3.json)
  merkez: { 10: [-42, 42], 11: [42, 42], 12: [42, -42], 13: [-42, -42] },
};
const ISLEM_G = 640;            // işlem genişliği (px)
const BOLGE = 0.6;              // arama çerçevesi: kısa kenarın oranı, ekran ortasında
const UZAK = [120, 350];        // kabul edilen kamera-kutu uzaklığı (mm)
const OLCUM_KARE = 300;         // Ölç modu kare sayısı

const $ = (id) => document.getElementById(id);
const ekran = $("ekran"), ctx = ekran.getContext("2d");
const maskeC = $("maske");
const maske2C = document.createElement("canvas");   // kapak maskesi (yalnız teşhis için)
const islemC = document.createElement("canvas"), islemCtx = islemC.getContext("2d", { willReadFrequently: true });
const video = document.createElement("video");
video.playsInline = true; video.muted = true;

let cvHazir = false, akis = null;
let kapakTakili = true, maskeGoster = false;
let sonZaman = performance.now(), fps = 0, gelenKare = 0, islenenKare = 0;
let teshis = {};
let tekKare = false;   // Teşhis düğmesi: bir karede maskeleri çiz, sonra kolaj yap
const maskeCiz = () => maskeGoster || tekKare;
const mod = () => $("mod").value;   // "markersiz" | "aruco" | "ikisi"

document.title = "Kutu Overlay " + SURUM;
$("surum").textContent = SURUM;

function cvYuklendi() {
  const bitti = () => { cvHazir = true; arucoHazirla(); kalibYukle(); durum("OpenCV hazır. Kamerayı başlat."); };
  anahtarYukle();
  if (cv.getBuildInformation) bitti(); else cv.onRuntimeInitialized = bitti;
}
function durum(t) { $("durum").textContent = t; }

async function kameraBaslat() {
  if (akis) return;
  try {
    akis = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
  } catch (e) { akis = null; durum("Kamera açılamadı: " + e.message + "\n(\"Kamerayı başlat\"a dokun)"); return; }
  video.srcObject = akis; await video.play();
  ekran.width = video.videoWidth; ekran.height = video.videoHeight;
  islemC.width = ISLEM_G; islemC.height = Math.round(ISLEM_G * video.videoHeight / video.videoWidth);
  maskeC.width = islemC.width; maskeC.height = islemC.height;
  $("basla").textContent = "Çalışıyor";
  oturumBaslat({ surum: SURUM, mod: mod(), kamera: kameraBilgisi(), kalib, fov: +$("fov").value, jig: "etiketsiz",
    parametreler: { G, TABAN, ISLEM_G, BOLGE, UZAK, OLCUM_KARE, TAKIP, FILTRE, OTO, HAM, KAYIT, POZ_SICRAMA_DER } });
  kareBekle();
}
$("basla").onclick = kameraBaslat;
// sayfa açılınca dene; tarayıcı dokunuş isterse düğme yedek olarak kalır
kameraBaslat();
// kamera karesi gelince işle (requestVideoFrameCallback); yoksa ekran tazelemesine bağlı
function kareBekle() {
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback((_, meta) => { gelenKare++; dongu(meta); });
  else requestAnimationFrame(() => { gelenKare++; dongu(null); });
}
$("kapak").onclick = (e) => {
  kapakTakili = !kapakTakili;
  e.target.textContent = "Kapak: " + (kapakTakili ? "takılı" : "çıkık");
  e.target.classList.toggle("aktif", kapakTakili);
  olayLog("kapak", { kapakTakili });
};
$("mod").onchange = () => olayLog("mod", { mod: mod() });
$("anahtarKaydet").onclick = () => { anahtarKaydet($("anahtar").value); $("anahtar").value = ""; };
$("maskeBtn").onclick = (e) => {
  maskeGoster = !maskeGoster; maskeC.style.display = maskeGoster ? "block" : "none";
  e.target.classList.toggle("aktif", maskeGoster);
};
$("kilitBirak").onclick = () => { kilit = null; };
$("teshis").onclick = () => { if (akis) tekKare = true; };
for (const [id, v] of [["esik", "esikV"], ["fov", "fovV"]]) $(id).oninput = () => ($(v).textContent = $(id).value);

// --- telefon hareketi: jiroskop + ivme, kareler arasında özetlenir ---
const hareket = { gyroMax: 0, gyroToplam: 0, ivmeMax: 0, n: 0 };
window.addEventListener("devicemotion", (e) => {
  const g = e.rotationRate, a = e.acceleration;   // derece/s, m/s² (yerçekimsiz)
  if (g) { const m = Math.hypot(g.alpha || 0, g.beta || 0, g.gamma || 0); hareket.gyroMax = Math.max(hareket.gyroMax, m); hareket.gyroToplam += m; }
  if (a) hareket.ivmeMax = Math.max(hareket.ivmeMax, Math.hypot(a.x || 0, a.y || 0, a.z || 0));
  hareket.n++;
});
function hareketAl() {
  const h = { gyroMax: +hareket.gyroMax.toFixed(2), gyroOrt: hareket.n ? +(hareket.gyroToplam / hareket.n).toFixed(2) : null, ivmeMax: +hareket.ivmeMax.toFixed(3), n: hareket.n };
  Object.assign(hareket, { gyroMax: 0, gyroToplam: 0, ivmeMax: 0, n: 0 });
  return h;
}

// --- kamera ayar kilidi: odak + pozlama + beyaz dengesi (titremenin bir kaynağı otomatik ayarların oynaması) ---
// Otomatik kilit yalnız odak + beyaz dengesi. Pozlama yalnız elle ve kontrollü: Android Chrome'da
// exposureMode "manual" mevcut süreyle bile karanlığa düşebiliyor -> görüntü %30+ kararırsa geri al.
let kameraKilitlendi = false, pozlamaKontrol = null, sonParlaklik = null;
$("kameraKilit").onclick = () => kameraKilitle(true);
async function kameraKilitle(pozlamaDa) {
  kameraKilitlendi = true;
  const iz = akis && akis.getVideoTracks()[0];
  if (!iz) return;
  const yet = iz.getCapabilities ? iz.getCapabilities() : {}, ayar = iz.getSettings ? iz.getSettings() : {};
  const sonuc = [];
  const dene = async (ad, kisit) => {
    try { await iz.applyConstraints({ advanced: [kisit] }); sonuc.push(ad + " ✓"); } catch (e) { sonuc.push(ad + " ✗"); }
  };
  if ((yet.focusMode || []).includes("manual")) await dene("odak", { focusMode: "manual", ...(ayar.focusDistance != null ? { focusDistance: ayar.focusDistance } : {}) });
  else if ((yet.focusMode || []).includes("single-shot")) await dene("odak(tek)", { focusMode: "single-shot" });
  else sonuc.push("odak yok");
  if (!pozlamaDa) sonuc.push("pozlama otomatik");
  else if ((yet.exposureMode || []).includes("manual") && ayar.exposureTime != null) {
    await dene("pozlama", { exposureMode: "manual", exposureTime: ayar.exposureTime });
    pozlamaKontrol = { once: sonParlaklik, zaman: performance.now() };
  } else sonuc.push("pozlama yok");
  if ((yet.whiteBalanceMode || []).includes("manual")) await dene("beyaz denge", { whiteBalanceMode: "manual", ...(ayar.colorTemperature != null ? { colorTemperature: ayar.colorTemperature } : {}) });
  else sonuc.push("beyaz denge yok");
  $("kameraKilit").classList.add("aktif");
  $("kameraKilit").textContent = "Kilit: " + sonuc.join(", ");
  olayLog("kamera-kilit", { sonuc, ayar: iz.getSettings ? iz.getSettings() : null });
}
function kameraBilgisi() {
  const iz = akis && akis.getVideoTracks()[0];
  if (!iz) return null;
  return { yetenek: iz.getCapabilities ? iz.getCapabilities() : null, ayar: iz.getSettings ? iz.getSettings() : null,
    video: [video.videoWidth, video.videoHeight], islem: [islemC.width, islemC.height], rvfc: !!video.requestVideoFrameCallback };
}

// --- dosya paylaşma (uzaktan: paylaş menüsü; yoksa indir) ---
async function paylas(blob, ad) {
  const dosya = new File([blob], ad, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [dosya] })) { await navigator.share({ files: [dosya] }); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = ad; a.click();
}

async function teshisPaylas() {
  // ekran + silüet maskesi + kapak maskesi + sayılar -> tek PNG
  const W = ekran.width, mw = Math.round(W / 2), mh = Math.round(mw * maskeC.height / maskeC.width);
  const satirlar = JSON.stringify({ surum: SURUM, mod: mod(), ...teshis, kapakTakili, fov: +$("fov").value, kalib: !!kalib }, (k, v) =>
    typeof v === "number" ? Math.round(v * 10) / 10 : v).match(/.{1,70}/g) || [];
  const yazi = 22, H = ekran.height + mh + 20 + satirlar.length * (yazi + 6);
  const k = document.createElement("canvas"); k.width = W; k.height = H;
  const c = k.getContext("2d");
  c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
  c.drawImage(ekran, 0, 0);
  if (maskeC.width) c.drawImage(maskeC, 0, ekran.height, mw, mh);
  if (maske2C.width) c.drawImage(maske2C, mw, ekran.height, mw, mh);
  c.fillStyle = "#fff"; c.font = `${yazi}px monospace`;
  satirlar.forEach((t, i) => c.fillText(t, 8, ekran.height + mh + 14 + (i + 1) * (yazi + 6)));
  const blob = await new Promise((ok) => k.toBlob(ok, "image/png"));
  if (kayitDurum.anahtar) { blobYukle("teshis.png", blob); jsonYukle("teshis", { surum: SURUM, mod: mod(), teshis, kapakTakili, kalib }); $("olcum").textContent = "teşhis kayda gönderildi"; }
  else await paylas(blob, "teshis.png");
}

// --- küçük 3B yardımcılar (Mat açmadan) ---
function rodrigues(r) {
  const th = Math.hypot(r[0], r[1], r[2]);
  if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const [x, y, z] = r.map((v) => v / th), c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}
const matCarp = (A, B) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
const matVek = (A, v) => [0, 1, 2].map((i) => A[i * 3] * v[0] + A[i * 3 + 1] * v[1] + A[i * 3 + 2] * v[2]);
const devrik = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
function aciFarki(R1, R2) {
  const M = matCarp(devrik(R1), R2), iz = M[0] + M[4] + M[8];
  return Math.acos(Math.max(-1, Math.min(1, (iz - 1) / 2))) * 180 / Math.PI;
}
const RZ90 = [0, -1, 0, 1, 0, 0, 0, 0, 1];
function aciFarkiKanonik(r1, r2) {
  // kare kutu z ekseni etrafında 4 katlı simetrik: 0/90/180/270° permütasyonları sıçrama sayılmasın
  const R1 = rodrigues(r1);
  let R2 = rodrigues(r2), en = Infinity;
  for (let k = 0; k < 4; k++) { en = Math.min(en, aciFarki(R1, R2)); R2 = matCarp(R2, RZ90); }
  return en;
}

// --- kamera iç parametreleri: kalibrasyon varsa o, yoksa FOV kaydırıcısı ---
let kalib = null;   // { w, h, K: [9], D: [5], rms, gorunum }
function kalibYukle() {
  try { const k = JSON.parse(localStorage.getItem("kalib") || "null"); if (k && k.K) kalib = k; } catch (e) { kalib = null; }
  kalibYaz();
}
function kalibYaz() {
  $("kalibDurum").textContent = kalib ? `kalibre: f=${kalib.K[0].toFixed(0)} px, rms ${kalib.rms.toFixed(2)} px, ${kalib.gorunum} görüntü (${kalib.w}×${kalib.h})` : "kalibrasyon yok (FOV kaydırıcısı kullanılıyor)";
}
function kameraMat(w, h) {
  if (kalib && kalib.w === w && kalib.h === h) return { K: cv.matFromArray(3, 3, cv.CV_64F, kalib.K), D: cv.matFromArray(5, 1, cv.CV_64F, kalib.D), kalibreli: true };
  const f = (w / 2) / Math.tan((+$("fov").value * Math.PI / 180) / 2);
  return { K: cv.matFromArray(3, 3, cv.CV_64F, [f, 0, w / 2, 0, f, h / 2, 0, 0, 1]), D: cv.Mat.zeros(5, 1, cv.CV_64F), kalibreli: false };
}
const pozSil = (p) => { if (p) { p.rvec.delete(); p.tvec.delete(); p.K.delete(); p.D.delete(); } };

// ====================== MARKERSIZ ======================
function koseSirala(pts) {
  // görüntüde saat yönü, sol-üstten başla (IPPE_SQUARE sırası)
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const s = pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let bas = 0;
  s.forEach((p, i) => { if (p.x + p.y < s[bas].x + s[bas].y) bas = i; });
  return s.slice(bas).concat(s.slice(0, bas));
}

function aramaBolgesi(w, h) {
  const a = Math.round(Math.min(w, h) * BOLGE);
  return { x: Math.round((w - a) / 2), y: Math.round((h - a) / 2), w: a, h: a };
}

function kutuBulBolge(src, b = aramaBolgesi(src.cols, src.rows)) {
  // yalnız verilen bölgede ara (varsayılan: ortadaki çerçeve); boyut, beklenen uzaklık aralığına uymalı
  const f = (src.cols / 2) / Math.tan((+$("fov").value * Math.PI / 180) / 2);
  const kenar = (z) => f * G.dis / z;   // üst yüzün piksel kenarı
  // silüet yan duvarlarla üst yüzden büyük görünebilir -> üst sınırda pay
  const alan = [kenar(UZAK[1]) ** 2 * 0.7, (kenar(UZAK[0]) * 1.8) ** 2];
  teshis.bolge = b; teshis.alanAraligi = alan.map(Math.round);
  const parca = src.roi(new cv.Rect(b.x, b.y, b.w, b.h));
  let k;
  try { k = kutuBul(parca, alan); } finally { parca.delete(); }
  if (!k) return null;
  k.kose = k.kose.map((p) => ({ x: p.x + b.x, y: p.y + b.y }));
  k.kont = k.kont.map((v, i) => v + (i % 2 ? b.y : b.x));
  return k;
}

let inceltSayac = { ok: 0, geri: 0 };
function koseIncelt(kont, kose) {
  // tamsayı köşe yerine: her kenara yakın kontur noktalarından doğru uydur (toplam en küçük kareler),
  // komşu doğruları kesiştir -> alt-piksel köşe. Köşe yakınındaki yuvarlak kısım dışarıda bırakılır.
  // Girdi CHAIN_APPROX_NONE olmalı: SIMPLE'da eksen hizalı kenar iki uca sıkışır, kenarda nokta kalmaz.
  const geri = () => { inceltSayac.geri++; return kose; };
  const kenarlar = [0, 1, 2, 3].map(() => []);
  for (let j = 0; j < kont.length; j += 2) {
    const x = kont[j], y = kont[j + 1];
    let enK = -1, enD = 3;   // kenara en fazla 3 px
    for (let k = 0; k < 4; k++) {
      const a = kose[k], b = kose[(k + 1) % 4], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const t = ((x - a.x) * dx + (y - a.y) * dy) / L2;
      if (t < 0.15 || t > 0.85) continue;
      const d = Math.abs((x - a.x) * dy - (y - a.y) * dx) / Math.sqrt(L2);
      if (d < enD) { enD = d; enK = k; }
    }
    if (enK >= 0) kenarlar[enK].push(x, y);
  }
  const dogrular = [];
  for (const p of kenarlar) {
    const n = p.length / 2;
    if (n < 3) return geri();
    let mx = 0, my = 0; for (let i = 0; i < p.length; i += 2) { mx += p[i]; my += p[i + 1]; } mx /= n; my /= n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < p.length; i += 2) { const dx = p[i] - mx, dy = p[i + 1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const aci = 0.5 * Math.atan2(2 * sxy, sxx - syy);   // ana eksen yönü
    dogrular.push({ mx, my, ux: Math.cos(aci), uy: Math.sin(aci) });
  }
  const yeni = [];
  for (let k = 0; k < 4; k++) {
    const A = dogrular[(k + 3) % 4], B = dogrular[k];   // köşe k = (k-1). kenar ile k. kenarın kesişimi
    const det = A.ux * -B.uy - A.uy * -B.ux;
    if (Math.abs(det) < 1e-6) return geri();
    const t = ((B.mx - A.mx) * -B.uy - (B.my - A.my) * -B.ux) / det;
    const q = { x: A.mx + t * A.ux, y: A.my + t * A.uy };
    if (Math.hypot(q.x - kose[k].x, q.y - kose[k].y) > 4) return geri();   // saçma sonuç -> vazgeç
    yeni.push(q);
  }
  inceltSayac.ok++;
  return yeni;
}

function enBuyukKontur(kont, enAlan) {
  // MatVector.get() her çağrıda silinmesi gereken yeni bir Mat döndürür
  let enIyi = -1;
  for (let i = 0; i < kont.size(); i++) { const c = kont.get(i), a = cv.contourArea(c); c.delete(); if (a > enAlan) { enAlan = a; enIyi = i; } }
  return [enIyi, enAlan];
}

function kenarMedyan(gri) {
  // 4 px'lik kenar şeridinin medyan parlaklığı
  const w = gri.cols, h = gri.rows, d = gri.data, hist = new Array(256).fill(0);
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= 4 && x < w - 4 && y >= 4 && y < h - 4) { x = w - 5; continue; }
    hist[d[y * w + x]]++; n++;
  }
  let say = 0;
  for (let i = 0; i < 256; i++) { say += hist[i]; if (say >= n / 2) return i; }
  return 255;
}

// eşik: kilitliyken neredeyse donuk (histerezis), DOM'a seyrek yazılır
let esikDurum = null, esikYazildi = 0;
function esikSec(gri) {
  const yeni = kenarMedyan(gri) * 0.8;   // metalik kapak kağıda yakın parlayabiliyor
  if (esikDurum === null || !kilit) esikDurum = yeni;
  else if (Math.abs(yeni - esikDurum) > 3) esikDurum = 0.95 * esikDurum + 0.05 * yeni;
  const t = Math.round(esikDurum), simdi = performance.now();
  if (simdi - esikYazildi > 500) { esikYazildi = simdi; $("esik").value = t; $("esikV").textContent = t; }
  return t;
}

function kutuBul(src, alan) {
  // koyu nesne (kutu + kapak) beyaz kağıt üzerinde -> en büyük dörtgen
  const gri = new cv.Mat(), ikili = new cv.Mat(), kont = new cv.MatVector(), hiy = new cv.Mat();
  let sonuc = null;
  try {
    cv.cvtColor(src, gri, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gri, gri, new cv.Size(5, 5), 0);
    // sahnede 3 ton var (kağıt, gri kapak, siyah duvar); Otsu bazen gri ile siyahı ayırıyor.
    // Kutu çerçeve kenarına değemez -> kenar şeridi = kağıt; eşiği kağıdın parlaklığından kur.
    const t = $("otomatik").checked ? esikSec(gri) : +$("esik").value;
    cv.threshold(gri, ikili, t, 255, cv.THRESH_BINARY_INV);
    teshis.esik1 = t;
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    cv.morphologyEx(ikili, ikili, cv.MORPH_CLOSE, k); k.delete();
    if (maskeCiz()) cv.imshow(maskeC, ikili);
    cv.findContours(ikili, kont, hiy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
    const adaylar = [], reddedilen = [];
    for (let i = 0; i < kont.size(); i++) {
      const c = kont.get(i), a = cv.contourArea(c);
      const r = cv.boundingRect(c); c.delete();
      if (a < 100) continue;
      const kenaraDegiyor = r.x <= 1 || r.y <= 1 || r.x + r.width >= src.cols - 1 || r.y + r.height >= src.rows - 1;
      if (kenaraDegiyor) { reddedilen.push("çerçeveye değiyor"); continue; }
      if (a > alan[1]) { reddedilen.push("çok büyük/yakın"); continue; }
      if (a < alan[0]) { if (a > alan[0] * 0.3) reddedilen.push("çok küçük/uzak"); continue; }
      adaylar.push([i, a]);
    }
    // gölge reddi: kutu İKİ tonlu (gri kapak + siyah duvar), gölge tek tonlu ve siyaha inmez.
    // En büyük birkaç adayı sırayla dene, doğrulamayı geçen ilkini al.
    adaylar.sort((x, y) => y[1] - x[1]);
    for (const [i, silAlan] of adaylar.slice(0, 4)) {
      const c = kont.get(i);
      teshis.silAlan = silAlan; teshis.silKont = c.data32S.length / 2;
      if (kapakTakili) {
        // kapak takılı: içinde gri kapak bulunamayan aday kutu değildir (silüete geri dönüş yok)
        const ust = ustYuzBul(gri, c, silAlan);
        if (ust) { const kd = c.data32S.slice(); c.delete(); teshis.reddedilen = reddedilen; return { kose: koseSirala(ust), yontem: "gri kapak", kont: kd }; }
        // tam tepeden bakışta yalnız kapak görünür (kapak = kutu dış ölçüsü) -> tek ton. O zaman gölgeden
        // ayıran: düzgün kare biçim + KESKİN kenar (gölge kenarı yumuşak, 5-15 px'e yayılır)
        if (teshis.kapak && teshis.kapak.tekTon) {
          const kare = kareMi(c), keskin = kenarKeskinligi(gri, c);
          teshis.tekTon = { kare, keskin: +keskin.toFixed(2) };
          if (kare && keskin > KENAR_KESKIN_MIN) {
            const yak = new cv.Mat(); cv.approxPolyDP(c, yak, 0.04 * cv.arcLength(c, true), true);
            let pts = []; for (let j = 0; j < 4; j++) pts.push({ x: yak.data32S[j * 2], y: yak.data32S[j * 2 + 1] });
            pts = koseIncelt(c.data32S, pts); yak.delete();
            const kd = c.data32S.slice(); c.delete(); teshis.reddedilen = reddedilen;
            return { kose: koseSirala(pts), yontem: "gri kapak", kont: kd };
          }
          reddedilen.push(kare ? `kenar yumuşak ${keskin.toFixed(2)} (gölge?)` : "kare değil (gölge?)");
        } else reddedilen.push("gri kapak yok (gölge?)");
        c.delete(); continue;
      }
      // kapak çıkık: siyah duvar halkası alanın ~%46'sı; adayda yeterince gerçekten siyah piksel olmalı
      const siyah = siyahOrani(gri, c, t / 0.8);
      teshis.siyahOrani = +siyah.toFixed(2);
      if (siyah < KUTU_SIYAH_ORAN) { reddedilen.push(`siyah az %${Math.round(siyah * 100)} (gölge?)`); c.delete(); continue; }
      const yak = new cv.Mat();
      cv.approxPolyDP(c, yak, 0.04 * cv.arcLength(c, true), true);
      let pts = [], yontem;
      if (yak.rows === 4 && cv.isContourConvex(yak)) {
        for (let i = 0; i < 4; i++) pts.push({ x: yak.data32S[i * 2], y: yak.data32S[i * 2 + 1] });
        pts = koseIncelt(c.data32S, pts);
        yontem = "dörtgen";
      } else {
        const r = cv.minAreaRect(c);
        pts = cv.RotatedRect.points(r).map((p) => ({ x: p.x, y: p.y }));
        yontem = `en küçük dikdörtgen (${yak.rows} köşe bulundu)`;
      }
      yak.delete();
      sonuc = { kose: koseSirala(pts), yontem: "silüet, " + yontem, kont: c.data32S.slice() };
      c.delete();
      break;
    }
    teshis.reddedilen = reddedilen;
  } finally { gri.delete(); ikili.delete(); kont.delete(); hiy.delete(); }
  return sonuc;
}

const KENAR_KESKIN_MIN = 0.22;  // kenardaki en büyük adım / ton farkı; sentetik: keskin kutu 0.30, yumuşak gölge 0.12-0.13 (gerçekte kayıtlardan ayarlanacak)
function kareMi(c) {
  // 4 köşeli, dışbükey, en-boy ~1, dolu (gölgeler genelde düzensiz ya da telefon gibi uzun)
  const yak = new cv.Mat(), hull = new cv.Mat();
  try {
    cv.approxPolyDP(c, yak, 0.04 * cv.arcLength(c, true), true);
    if (yak.rows !== 4 || !cv.isContourConvex(yak)) return false;
    const r = cv.minAreaRect(c), en = Math.max(r.size.width, r.size.height) / Math.max(1, Math.min(r.size.width, r.size.height));
    cv.convexHull(c, hull);
    const dolu = cv.contourArea(c) / Math.max(1, cv.contourArea(hull));
    return en < 1.35 && dolu > 0.93;
  } finally { yak.delete(); hull.delete(); }
}
function kenarKeskinligi(gri, c) {
  // kontur boyunca, normal yönünde ±6 px profil: en büyük komşu farkı / toplam ton farkı
  const d = c.data32S, w = gri.cols, h = gri.rows, g = gri.data, n = d.length / 2, sonuc = [];
  const adim = Math.max(1, Math.floor(n / 60));
  for (let i = 0; i < n; i += adim) {
    const a = (i - 3 + n) % n, b = (i + 3) % n;
    let tx = d[2 * b] - d[2 * a], ty = d[2 * b + 1] - d[2 * a + 1];
    const L = Math.hypot(tx, ty); if (L < 1) continue;
    const nx = -ty / L, ny = tx / L, x0 = d[2 * i], y0 = d[2 * i + 1], prof = [];
    for (let k = -6; k <= 6; k++) {
      const x = Math.round(x0 + nx * k), y = Math.round(y0 + ny * k);
      if (x < 0 || y < 0 || x >= w || y >= h) { prof.length = 0; break; }
      prof.push(g[y * w + x]);
    }
    if (prof.length < 13) continue;
    const ton = Math.abs(prof[12] - prof[0]); if (ton < 20) continue;
    let enBuyuk = 0; for (let k = 1; k < 13; k++) enBuyuk = Math.max(enBuyuk, Math.abs(prof[k] - prof[k - 1]));
    sonuc.push(enBuyuk / ton);
  }
  if (sonuc.length < 8) return 0;
  sonuc.sort((x, y) => x - y);
  return sonuc[sonuc.length >> 1];   // medyan
}
const KUTU_SIYAH_ORAN = 0.15;   // kapak çıkıkken adayda en az bu oranda "gerçekten siyah" piksel
function siyahOrani(gri, c, kagit) {
  // aday içindeki piksellerin ne kadarı kağıdın %40'ından koyu (mat siyah PLA ~20-50, gölge ~100-170)
  const m = cv.Mat.zeros(gri.rows, gri.cols, cv.CV_8U), mv = new cv.MatVector();
  try {
    mv.push_back(c); cv.drawContours(m, mv, 0, new cv.Scalar(255), cv.FILLED);
    const esik = kagit * 0.4, g = gri.data, md = m.data;
    let n = 0, koyu = 0;
    for (let i = 0; i < g.length; i++) if (md[i]) { n++; if (g[i] < esik) koyu++; }
    return n ? koyu / n : 0;
  } finally { m.delete(); mv.delete(); }
}

function ustYuzBul(gri, c, silAlan) {
  // silüet maskesi içinde Otsu: koyu sınıf = siyah duvarlar, açık sınıf = metalik gri kapak
  const sil = cv.Mat.zeros(gri.rows, gri.cols, cv.CV_8U), acik = new cv.Mat();
  const mv = new cv.MatVector(), kont = new cv.MatVector(), hiy = new cv.Mat(), yak = new cv.Mat();
  try {
    mv.push_back(c);
    cv.drawContours(sil, mv, 0, new cv.Scalar(255), cv.FILLED);
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    const silTam = sil.clone();
    cv.erode(sil, sil, k);   // kağıtla sınırdaki karışık pikselleri at (histogram için)
    const hist = new Array(256).fill(0), g = gri.data, m = sil.data;
    let n = 0;
    for (let i = 0; i < g.length; i++) if (m[i]) { hist[g[i]]++; n++; }
    if (n < 200) { teshis.kapak = { red: "silüet çok küçük" }; k.delete(); silTam.delete(); return null; }
    let top = 0; for (let i = 0; i < 256; i++) top += i * hist[i];
    let wB = 0, sB = 0, enIyiV = -1, t2 = 0, m0 = 0, m1 = 0;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (top - sB) / wF, v = wB * wF * (mB - mF) ** 2;
      if (v > enIyiV) { enIyiV = v; t2 = i; m0 = mB; m1 = mF; }
    }
    teshis.kapak = { esik2: t2, koyuOrt: +m0.toFixed(1), acikOrt: +m1.toFixed(1), n };
    if (m1 - m0 < 25) { teshis.kapak.tekTon = true; k.delete(); silTam.delete(); return null; }   // tek ton: ya tam tepeden kapak ya gölge
    cv.threshold(gri, acik, t2, 255, cv.THRESH_BINARY);
    cv.bitwise_and(acik, sil, acik);
    cv.morphologyEx(acik, acik, cv.MORPH_CLOSE, k);
    cv.morphologyEx(acik, acik, cv.MORPH_OPEN, k);
    cv.dilate(acik, acik, k); cv.bitwise_and(acik, silTam, acik);   // aşındırma kaymasını geri al
    k.delete(); silTam.delete();
    if (tekKare) { maske2C.width = acik.cols; maske2C.height = acik.rows; cv.imshow(maske2C, acik); }
    cv.findContours(acik, kont, hiy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
    const [enIyi, enAlan] = enBuyukKontur(kont, silAlan * 0.25);
    if (enIyi < 0) { teshis.kapak.red = "yeterli büyük açık bölge yok"; return null; }
    const ck = kont.get(enIyi);
    cv.approxPolyDP(ck, yak, 0.04 * cv.arcLength(ck, true), true);
    const ckData = ck.data32S.slice(); ck.delete();
    teshis.kapak.alan = enAlan; teshis.kapak.koseSayi = yak.rows;
    if (yak.rows !== 4 || !cv.isContourConvex(yak)) return null;
    const pts = []; for (let i = 0; i < 4; i++) pts.push({ x: yak.data32S[i * 2], y: yak.data32S[i * 2 + 1] });
    return koseIncelt(ckData, pts);
  } finally { sil.delete(); acik.delete(); mv.delete(); kont.delete(); hiy.delete(); yak.delete(); }
}

// markersız poz: üst yüz karesi -> IPPE_SQUARE. Poz kutu koordinatında döner (ofsetZ ile).
let oncekiPoz = null;   // kilitliyken bir önceki karenin HAM pozu + köşeleri
const POZ_SICRAMA_DER = 15;
function pozBulMarkersiz(kose, w, h) {
  const L = G.dis, ustZ = kapakTakili ? G.kapakUst : G.duvarUst;
  const obj = cv.matFromArray(4, 3, cv.CV_64F, [-L / 2, L / 2, 0, L / 2, L / 2, 0, L / 2, -L / 2, 0, -L / 2, -L / 2, 0]);
  const img = cv.matFromArray(4, 2, cv.CV_64F, kose.flatMap((p) => [p.x, p.y]));
  const { K, D, kalibreli } = kameraMat(w, h), rvec = new cv.Mat(), tvec = new cv.Mat();
  const ok = cv.solvePnP(obj, img, K, D, rvec, tvec, false, cv.SOLVEPNP_IPPE_SQUARE);
  obj.delete(); img.delete();
  if (!ok) { rvec.delete(); tvec.delete(); K.delete(); D.delete(); return null; }
  // düzlemsel kare iki eğime uyabilir; köşeler kımıldamadan poz tek karede çok dönerse bu sıçramadır.
  // 90° permütasyonlar (kare simetrisi) sıçrama sayılmaz.
  const r = Array.from(rvec.data64F), t = Array.from(tvec.data64F);
  let sicrama = false;
  if (oncekiPoz) {
    const hareket = kose.reduce((s, p, i) => s + Math.hypot(p.x - oncekiPoz.kose[i].x, p.y - oncekiPoz.kose[i].y), 0) / 4;
    if (aciFarkiKanonik(oncekiPoz.r, r) > POZ_SICRAMA_DER && hareket < 2) {
      rvec.data64F.set(oncekiPoz.r); tvec.data64F.set(oncekiPoz.t); sicrama = true;
    }
  }
  if (!sicrama) oncekiPoz = { r, t, kose: kose.map((p) => ({ ...p })) };
  return { rvec, tvec, K, D, ofsetZ: ustZ, kalibreli, sicrama,
    // kapak çıkıkken silüet yan duvarları da içerir: poz sistematik yanlı -> ölçüme uygun değil
    olcumeUygun: kapakTakili };
}

// ====================== ARUCO TABAN ======================
let arucoDet = null;
function arucoHazirla() {
  const p = new cv.aruco_DetectorParameters();
  p.cornerRefinementMethod = 1;   // CORNER_REFINE_SUBPIX
  arucoDet = new cv.aruco_ArucoDetector(cv.getPredefinedDictionary(cv.DICT_4X4_50), p, new cv.aruco_RefineParameters(10, 3, true));
}
function markerKose3B(id, z = TABAN.z) {
  // ArUco köşe sırası: sol-üst, sağ-üst, sağ-alt, sol-alt (marker üstü = +y, kamera yukarıdan bakar)
  const [cx, cy] = TABAN.merkez[id], s = TABAN.kenar / 2;
  return [[cx - s, cy + s, z], [cx + s, cy + s, z], [cx + s, cy - s, z], [cx - s, cy - s, z]];
}
function markerBul(gri) {
  const kose = new cv.MatVector(), ids = new cv.Mat(), red = new cv.MatVector(), out = [];
  try {
    arucoDet.detectMarkers(gri, kose, ids, red);
    teshis.arucoRed = red.size();
    for (let i = 0; i < ids.rows; i++) {
      const c = kose.get(i), d = c.data32F;
      out.push({ id: ids.data32S[i], kose: [0, 1, 2, 3].map((j) => ({ x: d[2 * j], y: d[2 * j + 1] })) });
      c.delete();
    }
  } finally { kose.delete(); ids.delete(); red.delete(); }
  return out;
}
function pozBulAruco(markerler, w, h) {
  const bilinen = markerler.filter((m) => TABAN.merkez[m.id]).sort((a, b) => a.id - b.id);
  if (!bilinen.length) return null;
  const { K, D, kalibreli } = kameraMat(w, h);
  // başlangıç: en büyük marker tek başına IPPE_SQUARE (kendi çerçevesinde), sonra kutu çerçevesine taşı
  const en = bilinen.reduce((a, b) => (alanK(b.kose) > alanK(a.kose) ? b : a));
  const s = TABAN.kenar / 2;
  const o1 = cv.matFromArray(4, 3, cv.CV_64F, [-s, s, 0, s, s, 0, s, -s, 0, -s, -s, 0]);
  const i1 = cv.matFromArray(4, 2, cv.CV_64F, en.kose.flatMap((p) => [p.x, p.y]));
  const rvec = new cv.Mat(), tvec = new cv.Mat();
  const ok = cv.solvePnP(o1, i1, K, D, rvec, tvec, false, cv.SOLVEPNP_IPPE_SQUARE);
  o1.delete(); i1.delete();
  if (!ok) { rvec.delete(); tvec.delete(); K.delete(); D.delete(); return null; }
  const R = rodrigues(Array.from(rvec.data64F)), c = [...TABAN.merkez[en.id], TABAN.z];
  const Rc = matVek(R, c);
  tvec.data64F.set([0, 1, 2].map((i) => tvec.data64F[i] - Rc[i]));   // t_kutu = t_marker - R·c
  const obj = bilinen.flatMap((m) => markerKose3B(m.id).flat()), img = bilinen.flatMap((m) => m.kose.flatMap((p) => [p.x, p.y]));
  const om = cv.matFromArray(obj.length / 3, 3, cv.CV_64F, obj), im = cv.matFromArray(img.length / 2, 2, cv.CV_64F, img);
  if (bilinen.length > 1) cv.solvePnP(om, im, K, D, rvec, tvec, true, cv.SOLVEPNP_ITERATIVE);
  // yeniden izdüşüm hatası (FRE): doğruluk DEĞİL, yalnız tutarlılık göstergesi
  const pr = new cv.Mat();
  cv.projectPoints(om, rvec, tvec, K, D, pr);
  let e2 = 0; for (let i = 0; i < img.length; i++) e2 += (pr.data64F[i] - img[i]) ** 2;
  pr.delete(); om.delete(); im.delete();
  return { rvec, tvec, K, D, ofsetZ: 0, kalibreli, markerSayisi: bilinen.length, ids: bilinen.map((m) => m.id),
    fre: Math.sqrt(e2 / (img.length / 2)), olcumeUygun: true };
}

// ====================== İZDÜŞÜM / ÇİZİM ======================
function yansit(poz, noktalarKutu) {
  // kutu koordinatı (iç taban z=0) -> pozun çerçevesi (markersızda üst yüz, ofsetZ) -> piksel
  const o = poz.ofsetZ;
  const p = cv.matFromArray(noktalarKutu.length, 3, cv.CV_64F, noktalarKutu.flatMap(([x, y, z]) => [x, y, z - o]));
  const out = new cv.Mat();
  cv.projectPoints(p, poz.rvec, poz.tvec, poz.K, poz.D, out);
  const r = []; for (let i = 0; i < noktalarKutu.length; i++) r.push({ x: out.data64F[i * 2], y: out.data64F[i * 2 + 1] });
  p.delete(); out.delete(); return r;
}
function kutuCerceveR_t(poz) {
  // pozu kutu çerçevesine çevir: X_kam = R·X_kutu + t  (markersızda ofsetZ kaydırması)
  const R = rodrigues(Array.from(poz.rvec.data64F)), t = Array.from(poz.tvec.data64F);
  const Ro = matVek(R, [0, 0, -poz.ofsetZ]);
  return { R, t: t.map((v, i) => v + Ro[i]) };
}

function kutuKoseleri(x0, x1, y0, y1, z0, z1) {
  return [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
}
const KENARLAR = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

function telKafes(p, s, renk, kalinlik, kesik) {
  ctx.strokeStyle = renk; ctx.lineWidth = kalinlik; ctx.setLineDash(kesik ? [8, 6] : []);
  ctx.beginPath();
  for (const [a, b] of KENARLAR) { ctx.moveTo(p[a].x * s, p[a].y * s); ctx.lineTo(p[b].x * s, p[b].y * s); }
  ctx.stroke(); ctx.setLineDash([]);
}

// 1€ filtresi (Casiez 2012): yavaşta güçlü yumuşatma, hızlıda az gecikme. YALNIZ ÇİZİMDE.
class OneEuro {
  constructor(minCutoff, beta, dCutoff = 1) { Object.assign(this, { minCutoff, beta, dCutoff, x: null, dx: 0, t: 0 }); }
  static a(cutoff, dt) { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); }
  filtre(x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    const dt = Math.max((t - this.t) / 1000, 1e-3); this.t = t;
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.a(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.a(cutoff, dt) * (x - this.x);
    return this.x;
  }
}
const FILTRE = { minCutoff: 1.0, beta: 0.02 };   // px; minCutoff düşük = sabitken daha durgun ama gecikmeli
let cizimFiltre = {};
function yumusat2B(anahtar, pts, t) {
  if (!$("yumusat").checked) return pts;
  const f = (cizimFiltre[anahtar] ||= pts.map(() => [new OneEuro(FILTRE.minCutoff, FILTRE.beta), new OneEuro(FILTRE.minCutoff, FILTRE.beta)]));
  return pts.map((p, i) => ({ x: f[i][0].filtre(p.x, t), y: f[i][1].filtre(p.y, t) }));
}

function overlayCiz(poz, s, t, anahtar, renkKup) {
  const d = G.dis / 2, i = G.ic / 2, k = G.kup / 2, ust = kapakTakili ? G.kapakUst : G.duvarUst;
  telKafes(yumusat2B(anahtar + "kutu", yansit(poz, kutuKoseleri(-d, d, -d, d, -G.tabanT, ust)), t), s, "rgba(200,210,220,0.55)", 2, false);
  telKafes(yumusat2B(anahtar + "zarf", yansit(poz, kutuKoseleri(-i, i, -i, i, 0, G.ic)), t), s, "rgba(255,179,71,0.8)", 2, true);
  telKafes(yumusat2B(anahtar + "kup", yansit(poz, kutuKoseleri(-k, k, -k, k, 0, G.kup)), t), s, renkKup, 3, false);
}

// kırmızı küp: görüntüdeki üst yüz merkezinin ışınını küp üstü düzlemiyle (z = kup) kesiştir -> kutu koordinatında yer
function kirmiziBul(src) {
  const hsv = new cv.Mat(), m1 = new cv.Mat(), m2 = new cv.Mat(), kont = new cv.MatVector(), hiy = new cv.Mat();
  let sonuc = null;
  try {
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB); cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
    const sinir = (h, s, v) => new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [h, s, v, 0]);
    const a1 = sinir(0, 90, 60), b1 = sinir(10, 255, 255), a2 = sinir(165, 90, 60), b2 = sinir(180, 255, 255);
    cv.inRange(hsv, a1, b1, m1); cv.inRange(hsv, a2, b2, m2); cv.bitwise_or(m1, m2, m1);
    [a1, b1, a2, b2].forEach((m) => m.delete());
    cv.findContours(m1, kont, hiy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const [enIyi] = enBuyukKontur(kont, 60);
    if (enIyi >= 0) {
      const ck = kont.get(enIyi), mo = cv.moments(ck);
      sonuc = { x: mo.m10 / mo.m00, y: mo.m01 / mo.m00, kont: ck.data32S.slice() };
      ck.delete();
    }
  } finally { hsv.delete(); m1.delete(); m2.delete(); kont.delete(); hiy.delete(); }
  return sonuc;
}
function kupYeri(poz, px) {
  // piksel -> kamera ışını (distorsiyon ihmal) -> kutu koordinatı -> z = G.kup düzlemiyle kesişim
  const K = poz.K.data64F, { R, t } = kutuCerceveR_t(poz), Rt = devrik(R);
  const isin = [(px.x - K[2]) / K[0], (px.y - K[5]) / K[4], 1];
  const o = matVek(Rt, t.map((v) => -v)), yon = matVek(Rt, isin);   // kamera merkezi ve ışın, kutu çerçevesinde
  if (Math.abs(yon[2]) < 1e-9) return null;
  const l = (G.kup - o[2]) / yon[2];
  return { x: o[0] + l * yon[0], y: o[1] + l * yon[1] };
}

// ====================== KİLİT + TAKİP (markersız) ======================
// Kutu bir kez bulununca kilitlenir. Tespitin kaçtığı karelerde noktalar optik akışla izlenir
// (homografi -> köşeler). Tespit doğrularsa ölçüm = tespit (LK yalnız köprü). Kilit yalnız kutu
// ekrandan çıkınca ya da noktalar kaybolunca bırakılır.
const TAKIP = {
  enAzNokta: 6,          // homografi için gereken en az iyi nokta
  yenileAlti: 15,        // nokta sayısı bunun altına inince yeniden seç
  dogrulaHarmani: 1.0,   // tespit doğrularsa köşe = tespit (ölçüm ham tespitten)
  uyusmazSiniri: 15,     // art arda bu kadar uyuşmaz tespit -> tespite yeniden kilitlen
  bayatMs: 3000,         // bu süredir doğrulanmadıysa "doğrulanmadı" diye göster
};
let kilit = null, oncekiGri = null, bulmaOrani = 0;

function koseEsle(yeni, eski) {
  // köşe sırası kareler arasında dönebilir: eskiyle en iyi eşleşen döndürmeyi seç
  let enIyi = yeni, enD = Infinity;
  for (let r = 0; r < 4; r++) {
    const k = yeni.slice(r).concat(yeni.slice(0, r));
    const d = k.reduce((t, p, i) => t + Math.hypot(p.x - eski[i].x, p.y - eski[i].y), 0) / 4;
    if (d < enD) { enD = d; enIyi = k; }
  }
  return [enIyi, enD];
}

const kenarUz = (k) => (Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y) + Math.hypot(k[1].x - k[2].x, k[1].y - k[2].y)) / 2;
const alanK = (k) => Math.abs(k.reduce((t, p, i) => { const q = k[(i + 1) % k.length]; return t + p.x * q.y - q.x * p.y; }, 0)) / 2;

function noktaSec(gri, kose) {
  // kutu çokgeninin biraz genişletilmiş hali içinde izlenebilir köşe noktaları
  const cx = kose.reduce((t, p) => t + p.x, 0) / 4, cy = kose.reduce((t, p) => t + p.y, 0) / 4;
  const genis = kose.flatMap((p) => [Math.round(cx + (p.x - cx) * 1.2), Math.round(cy + (p.y - cy) * 1.2)]);
  const maske = cv.Mat.zeros(gri.rows, gri.cols, cv.CV_8U), cm = cv.matFromArray(4, 1, cv.CV_32SC2, genis);
  const mv = new cv.MatVector(), out = new cv.Mat();
  try {
    mv.push_back(cm); cv.fillPoly(maske, mv, new cv.Scalar(255));
    cv.goodFeaturesToTrack(gri, out, 40, 0.01, 4, maske);
    return Array.from(out.data32F);
  } finally { maske.delete(); cm.delete(); mv.delete(); out.delete(); }
}

function akisIzle(gri) {
  // önceki kare -> bu kare: noktaları LK ile taşı, homografiyle köşeleri güncelle
  const n = kilit.pts.length / 2;
  if (n < TAKIP.enAzNokta) return false;
  const p0 = cv.matFromArray(n, 1, cv.CV_32FC2, kilit.pts), p1 = new cv.Mat(), st = new cv.Mat(), err = new cv.Mat();
  const ic = new cv.Mat();
  let a = null, b = null, H = null;
  try {
    cv.calcOpticalFlowPyrLK(oncekiGri, gri, p0, p1, st, err, new cv.Size(21, 21), 3);
    const eski = [], yeni = [];
    for (let i = 0; i < n; i++) if (st.data[i]) { eski.push(p0.data32F[2 * i], p0.data32F[2 * i + 1]); yeni.push(p1.data32F[2 * i], p1.data32F[2 * i + 1]); }
    const m = eski.length / 2;
    if (m < TAKIP.enAzNokta) return false;
    a = cv.matFromArray(m, 1, cv.CV_32FC2, eski); b = cv.matFromArray(m, 1, cv.CV_32FC2, yeni);
    H = cv.findHomography(a, b, cv.RANSAC, 3, ic);
    if (H.empty()) return false;
    const h = H.data64F;
    const kose = kilit.kose.map(({ x, y }) => { const w = h[6] * x + h[7] * y + h[8]; return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w }; });
    // akıl sağlığı: kare başına boyut çok değişmez
    const oran = alanK(kose) / alanK(kilit.kose);
    if (!(oran > 0.7 && oran < 1.4)) return false;
    const pts = []; for (let i = 0; i < m; i++) if (ic.data[i]) pts.push(yeni[2 * i], yeni[2 * i + 1]);
    kilit.kose = kose; kilit.pts = pts;
    return true;
  } finally { [p0, p1, st, err, ic].forEach((x) => x.delete()); if (a) a.delete(); if (b) b.delete(); if (H) H.delete(); }
}

function ekrandaMi(kose, w, h) {
  return kose.filter((p) => p.x < 0 || p.y < 0 || p.x > w || p.y > h).length < 2;
}

function yeniKilit(tespit, gri, simdi) {
  return { kose: tespit.kose, kont: tespit.kont, yontem: tespit.yontem, pts: noktaSec(gri, tespit.kose), dogrulandi: simdi, uyusmaz: 0 };
}

function takipEt(src, gri, simdi) {
  // dönüş: { kutu, durum: "yeni" | "doğrulandı" | "takipte" | "doğrulanmadı" } | null
  const w = src.cols, h = src.rows;
  if (!$("kilitAc").checked) kilit = null;
  if (kilit && oncekiGri && !akisIzle(gri)) { kilit = null; teshis.kilitBirakildi = "noktalar kayboldu"; hamGoruntuIste("kilit-kayip"); }
  if (kilit && !ekrandaMi(kilit.kose, w, h)) { kilit = null; teshis.kilitBirakildi = "ekrandan çıktı"; }

  // tespit: kilitliyken kutunun çevresinde, değilken ortadaki çerçevede
  let bolge = null;
  if (kilit) {
    const xs = kilit.kose.map((p) => p.x), ys = kilit.kose.map((p) => p.y), pay = kenarUz(kilit.kose) * 0.8;
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - pay)), y0 = Math.max(0, Math.floor(Math.min(...ys) - pay));
    const x1 = Math.min(w, Math.ceil(Math.max(...xs) + pay)), y1 = Math.min(h, Math.ceil(Math.max(...ys) + pay));
    if (x1 - x0 > 20 && y1 - y0 > 20) bolge = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const tespit = kilit ? (bolge ? kutuBulBolge(src, bolge) : null) : kutuBulBolge(src);
  bulmaOrani = 0.95 * bulmaOrani + 0.05 * (tespit ? 1 : 0);
  teshis.takipBolge = bolge;

  if (!kilit) {
    if (!tespit) return null;
    kilit = yeniKilit(tespit, gri, simdi);
    return { kutu: kilit, durum: "yeni" };
  }
  if (tespit) {
    const [esli, d] = koseEsle(tespit.kose, kilit.kose);
    // gri kapak (üst yüz) ile silüet farklı dörtgenler: yalnız kilitteki yöntemle doğrula, yoksa ikisi arasında zıplar
    const ayniYontem = tespit.yontem.split(",")[0] === kilit.yontem.split(",")[0];
    if (!ayniYontem && tespit.yontem === "gri kapak") {   // daha iyi üst yüz bulundu -> kilidi ona yükselt
      kilit = yeniKilit(tespit, gri, simdi);
      return { kutu: kilit, durum: "yeni" };
    }
    if (!ayniYontem) teshis.yontemUyusmaz = tespit.yontem;
    else if (d < kenarUz(kilit.kose) * 0.35) {
      const a = TAKIP.dogrulaHarmani;
      kilit.kose = esli.map((p, i) => ({ x: a * p.x + (1 - a) * kilit.kose[i].x, y: a * p.y + (1 - a) * kilit.kose[i].y }));
      kilit.kont = tespit.kont; kilit.yontem = tespit.yontem; kilit.dogrulandi = simdi; kilit.uyusmaz = 0;
      if (kilit.pts.length / 2 < TAKIP.yenileAlti) kilit.pts = noktaSec(gri, kilit.kose);
      return { kutu: kilit, durum: "doğrulandı" };
    }
    if (ayniYontem && ++kilit.uyusmaz > TAKIP.uyusmazSiniri) {
      kilit = yeniKilit(tespit, gri, simdi);
      return { kutu: kilit, durum: "yeni" };
    }
  }
  if (kilit.pts.length / 2 < TAKIP.yenileAlti) kilit.pts = noktaSec(gri, kilit.kose);
  return { kutu: kilit, durum: simdi - kilit.dogrulandi > TAKIP.bayatMs ? "doğrulanmadı" : "takipte" };
}

// ====================== KALİBRASYON (taban plakasıyla) ======================
// Plakadaki 16 marker köşesi düzlemsel bir hedef: farklı açılardan >=10 görüntü -> calibrateCameraExtended.
// Düzlemsel hedefte nesne noktaları z=0 olmalı (OpenCV başlangıç tahmini için şart).
let kalibGorunum = [];   // [{ obj: [...], img: [...] }]
$("kalibEkle").onclick = () => { kalibIste = true; };
let kalibIste = false;
$("kalibSifirla").onclick = () => {
  kalibGorunum = []; kalib = null;
  try { localStorage.removeItem("kalib"); } catch (e) { /* özel pencere */ }
  kalibYaz(); $("kalibEkle").textContent = "Kalib: görüntü ekle (0)";
};
$("kalibHesapla").onclick = () => kalibHesapla();
function kalibHesapla() {
  if (kalibGorunum.length < 8) { $("kalibDurum").textContent = `en az 8 görüntü gerekli (şu an ${kalibGorunum.length})`; return; }
  const objV = new cv.MatVector(), imgV = new cv.MatVector();
  for (const g of kalibGorunum) {
    const o = cv.matFromArray(g.obj.length / 3, 1, cv.CV_32FC3, g.obj), im = cv.matFromArray(g.img.length / 2, 1, cv.CV_32FC2, g.img);
    objV.push_back(o); imgV.push_back(im); o.delete(); im.delete();
  }
  const K = new cv.Mat(), D = new cv.Mat(), rv = new cv.MatVector(), tv = new cv.MatVector(), s1 = new cv.Mat(), s2 = new cv.Mat(), pe = new cv.Mat();
  try {
    K.create(3, 3, cv.CV_64F); D.create(5, 1, cv.CV_64F);
    const crit = new cv.TermCriteria(cv.TermCriteria_COUNT + cv.TermCriteria_EPS, 60, 1e-6);
    const rms = cv.calibrateCameraExtended(objV, imgV, new cv.Size(islemC.width, islemC.height), K, D, rv, tv, s1, s2, pe,
      cv.CALIB_FIX_K3 | cv.CALIB_ZERO_TANGENT_DIST, crit);
    kalib = { w: islemC.width, h: islemC.height, K: Array.from(K.data64F), D: Array.from(D.data64F).slice(0, 5), rms, gorunum: kalibGorunum.length,
      fStd: Array.from(s1.data64F).slice(0, 2), zaman: new Date().toISOString() };
    try { localStorage.setItem("kalib", JSON.stringify(kalib)); } catch (e) { /* özel pencere: yalnız bu oturum */ }
    kalibYaz();
    olayLog("kalibrasyon", { kalib, perView: Array.from(pe.data64F) });
  } catch (e) {
    $("kalibDurum").textContent = "kalibrasyon başarısız: " + (typeof e === "number" ? cv.exceptionFromPtr(e).msg : e.message || e);
  } finally { [objV, imgV, K, D, rv, tv, s1, s2, pe].forEach((m) => m.delete()); }
}
function kalibGorunumEkle(markerler, r) {
  const bilinen = markerler.filter((m) => TABAN.merkez[m.id]);
  if (bilinen.length < 3) { $("kalibDurum").textContent = "en az 3 marker görünmeli"; return; }
  kalibGorunum.push({ r, obj: bilinen.flatMap((m) => markerKose3B(m.id, 0).flat()), img: bilinen.flatMap((m) => m.kose.flatMap((p) => [p.x, p.y])) });
  $("kalibEkle").textContent = `Kalib: görüntü ekle (${kalibGorunum.length})`;
  $("kalibDurum").textContent = "plakayı farklı açıdan (10-40° eğik) tut, tekrar ekle; 10+ olunca Hesapla";
}

// ====================== ÖLÇ modu ======================
// Sabit telefonda OLCUM_KARE kare: ham köşeler, ham poz, yöntem, eşik, ms. Sonuç ekranda + JSON paylaş.
let olcum = null;
$("olc").onclick = () => { if (akis && !olcum) olcumBaslat("elle"); };
function olcumBaslat(neden) {
  hamGoruntuIste("olcum-bas");
  olcum = { bas: performance.now(), gelen0: gelenKare, kareler: [], mod: mod(), neden };
  $("olc").textContent = "Ölçülüyor… 0/" + OLCUM_KARE; $("olc").classList.add("aktif");
}
function olcumKaydet(kayit) {
  if (!olcum) return;
  olcum.kareler.push(kayit);
  $("olc").textContent = `Ölçülüyor… ${olcum.kareler.length}/${OLCUM_KARE}`;
  if (olcum.kareler.length >= OLCUM_KARE) olcumBitir();
}
const ort = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a) => { const m = ort(a); return Math.sqrt(ort(a.map((v) => (v - m) ** 2))); };
const yuzdelik = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
function olcumOzet(kareler, kaynak) {
  // kaynak: "aruco" | "markersiz" -> o kaynağın ham sayılarının istatistiği
  const k = kareler.map((x) => x[kaynak]).filter(Boolean);
  if (k.length < 10) return { kaynak, poz: k.length, not: "yetersiz kare" };
  // köşe σ: en sık görülen köşe kümesiyle (aynı id/yöntem) kareler
  const anahtar = (x) => x.anahtar, sayim = {};
  k.forEach((x) => (sayim[anahtar(x)] = (sayim[anahtar(x)] || 0) + 1));
  const ana = Object.entries(sayim).sort((a, b) => b[1] - a[1])[0][0], ayni = k.filter((x) => x.anahtar === ana);
  const n = ayni[0].kose.length, koseSd = [];
  for (let i = 0; i < n; i++) koseSd.push(sd(ayni.map((x) => x.kose[i])));
  let flip = 0, oncR = null;
  for (const x of k) { if (oncR && aciFarkiKanonik(oncR, x.r) > 5) flip++; oncR = x.r; }
  return {
    kaynak, poz: k.length, anaKume: ana, anaKumeKare: ayni.length,
    koseSdPx: +ort(koseSd).toFixed(3), koseSdMaxPx: +Math.max(...koseSd).toFixed(3),
    kupTabanSdPx: +Math.hypot(sd(k.map((x) => x.kupTaban.x)), sd(k.map((x) => x.kupTaban.y))).toFixed(3),
    uzaklikSdMm: +sd(k.map((x) => Math.hypot(...x.t))).toFixed(3), uzaklikOrtMm: +ort(k.map((x) => Math.hypot(...x.t))).toFixed(1),
    flip5der: flip, sicrama: k.filter((x) => x.sicrama).length,
    yontemDegisimi: k.reduce((s, x, i) => s + (i && x.anahtar !== k[i - 1].anahtar ? 1 : 0), 0),
    freOrtPx: k[0].fre != null ? +ort(k.map((x) => x.fre)).toFixed(3) : undefined,
  };
}
async function olcumBitir() {
  const o = olcum; olcum = null; oto.sonOlcum = performance.now();
  hamGoruntuIste("olcum-son");
  const sure = (performance.now() - o.bas) / 1000, ms = o.kareler.map((x) => x.ms);
  const ozet = {
    surum: SURUM, zaman: new Date().toISOString(), mod: o.mod, neden: o.neden, kare: o.kareler.length, sureSn: +sure.toFixed(2),
    islenenFps: +(o.kareler.length / sure).toFixed(1), gelenFps: +((gelenKare - o.gelen0) / sure).toFixed(1),
    msOrt: +ort(ms).toFixed(1), msP95: +yuzdelik(ms, 0.95).toFixed(1),
    kalibreli: !!(kalib && kalib.w === islemC.width), fov: +$("fov").value, yumusat: $("yumusat").checked, kapakTakili,
    incelt: { ...inceltSayac },
    aruco: olcumOzet(o.kareler, "aruco"), markersiz: olcumOzet(o.kareler, "markersiz"),
  };
  // iki kaynak birlikteyse: küp taban merkezinin iki pozdaki izdüşüm farkı (px) -> karşılaştırma kolu
  const ikisi = o.kareler.filter((x) => x.aruco && x.markersiz);
  if (ikisi.length >= 10) {
    const f = ikisi.map((x) => Math.hypot(x.aruco.kupTaban.x - x.markersiz.kupTaban.x, x.aruco.kupTaban.y - x.markersiz.kupTaban.y));
    ozet.arucoMarkersizFarkPx = { ort: +ort(f).toFixed(2), medyan: +yuzdelik(f, 0.5).toFixed(2), p95: +yuzdelik(f, 0.95).toFixed(2), kare: f.length };
  }
  const satir = (s) => s && s.koseSdPx != null
    ? `${s.kaynak}: köşe σ ${s.koseSdPx} px (max ${s.koseSdMaxPx}), küp-taban σ ${s.kupTabanSdPx} px, Z σ ${s.uzaklikSdMm} mm @${s.uzaklikOrtMm} mm, flip ${s.flip5der}, poz ${s.poz}/${ozet.kare}`
    : `${s.kaynak}: ${s.not || "yok"} (${s.poz} poz)`;
  $("olcumSonuc").textContent = [
    `ÖLÇÜM ${SURUM} · ${ozet.kare} kare / ${ozet.sureSn} s · işlenen ${ozet.islenenFps} fps (kamera ${ozet.gelenFps}) · ${ozet.msOrt} ms/kare (p95 ${ozet.msP95})`,
    satir(ozet.aruco), satir(ozet.markersiz),
    ozet.arucoMarkersizFarkPx ? `aruco↔markersız küp farkı: medyan ${ozet.arucoMarkersizFarkPx.medyan} px, p95 ${ozet.arucoMarkersizFarkPx.p95} px` : "",
    `incelt ok/geri: ${inceltSayac.ok}/${inceltSayac.geri} · kalibre: ${ozet.kalibreli ? "evet" : "hayır (FOV)"}`,
  ].filter(Boolean).join("\n");
  $("olc").textContent = "Ölç (" + OLCUM_KARE + " kare)"; $("olc").classList.remove("aktif");
  const tam = { ozet, kamera: kameraBilgisi(), kalib, kareler: o.kareler };
  if (kayitDurum.anahtar) { jsonYukle("olcum-" + o.mod, tam); $("olcumSonuc").textContent += "\n→ kayda gönderiliyor (ar-overlay-kayit)"; }
  else await paylas(new Blob([JSON.stringify(tam)], { type: "application/json" }), `olcum-${SURUM}-${o.mod}-${Date.now()}.json`);
}
function kareKaydi(poz, anahtar, kose) {
  // ölçüm için HAM poz kaydı (filtresiz)
  const kt = yansit(poz, [[0, 0, 0]])[0], { R } = kutuCerceveR_t(poz);
  // eğim: kamera ekseni ile kutu/plaka normali arasındaki açı (0 = tam tepeden)
  const egim = Math.acos(Math.min(1, Math.abs(R[8]))) * 180 / Math.PI;
  return { anahtar, egim: +egim.toFixed(2), kose: kose.flatMap((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]), r: Array.from(poz.rvec.data64F), t: Array.from(poz.tvec.data64F),
    kupTaban: { x: kt.x, y: kt.y }, sicrama: !!poz.sicrama, fre: poz.fre };
}

// ====================== VERİ: görüntü kalitesi, kamera ayarı, ham kare ======================
function goruntuKalitesi(gri, kayit) {
  // parlaklık = ortalama gri; bulanıklık = ortadaki karede Laplace varyansı (düşük = bulanık)
  kayit.parlaklik = +cv.mean(gri)[0].toFixed(1);
  const a = Math.min(200, gri.cols, gri.rows), roi = gri.roi(new cv.Rect((gri.cols - a) >> 1, (gri.rows - a) >> 1, a, a));
  const lap = new cv.Mat(), ort = new cv.Mat(), std = new cv.Mat();
  try { cv.Laplacian(roi, lap, cv.CV_64F); cv.meanStdDev(lap, ort, std); kayit.bulaniklik = +(std.data64F[0] ** 2).toFixed(1); }
  finally { roi.delete(); lap.delete(); ort.delete(); std.delete(); }
}
let sonKameraAyar = "", sonAyarBakis = 0;
function kameraAyarDegisimi() {
  // pozlama/ISO/odak/beyaz dengesi her 2 s'de bir okunur; değiştiyse kayda girer
  const simdi = performance.now();
  if (simdi - sonAyarBakis < 2000 || !akis) return undefined;
  sonAyarBakis = simdi;
  const a = akis.getVideoTracks()[0].getSettings ? akis.getVideoTracks()[0].getSettings() : {};
  const ozet = { exposureMode: a.exposureMode, exposureTime: a.exposureTime, iso: a.iso, focusMode: a.focusMode, focusDistance: a.focusDistance,
    whiteBalanceMode: a.whiteBalanceMode, colorTemperature: a.colorTemperature, zoom: a.zoom, width: a.width, height: a.height, frameRate: a.frameRate };
  const j = JSON.stringify(ozet);
  if (j === sonKameraAyar) return undefined;
  sonKameraAyar = j; return ozet;
}
// ham tam çözünürlüklü kare: yeni algoritmaları aynı gerçek görüntülerde yeniden koşmak için (tekrar oynatma)
const HAM = { periyotMs: 5000, olayAraMs: 2000, kalite: 0.92 };
let sonHamPeriyot = 0, sonHamOlay = 0, hamIste = null;
function hamGoruntuIste(neden) { hamIste = neden; }
function hamGoruntuKontrol(simdi) {
  if (!kayitDurum.anahtar || !akis) return;
  let neden = null;
  if (hamIste && simdi - sonHamOlay > HAM.olayAraMs) { neden = hamIste; hamIste = null; sonHamOlay = simdi; }
  else if (simdi - sonHamPeriyot > HAM.periyotMs) { neden = "periyot"; sonHamPeriyot = simdi; }
  if (!neden) return;
  const c = document.createElement("canvas"); c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext("2d").drawImage(video, 0, 0);
  const t = Math.round(simdi - oturumBas);
  c.toBlob((b) => b && blobYukle(`ham-${neden}-t${t}.jpg`, b), "image/jpeg", HAM.kalite);
}

// ====================== OTOMATİK PİLOT ======================
// Kullanıcı yalnız telefonu tutar. Telefon sabitse ölçüm kendiliğinden başlar; poz ilk oturunca kamera
// ayarları kilitlenir; plaka farklı açılardan görüldükçe kalibrasyon görüntüsü toplanıp hesaplanır;
// kutunun içinde kırmızı küp görünürse kapak çıkık sayılır.
const OTO = {
  sabitKare: 30,         // bu kadar kare boyunca...
  sabitPx: 1.5,          // ...küp taban izdüşümünün σ'sı bunun altındaysa telefon "sabit"
  olcumAraMs: 20000,     // iki otomatik ölçüm arası en az
  olcumKaymaPx: 10,      // ölçüm sırasında bu kadar kayarsa ölçüm iptal (telefon oynadı)
  kilitGecikmeMs: 1500,  // poz ilk bulunduktan bu kadar sonra kamera kilidi (pozlama otursun)
  kalibHedef: 12,        // bu kadar farklı açı toplanınca kalibrasyon hesaplanır
  kalibFarkDer: 8,       // yeni görüntü eldekilerden en az bu kadar farklı açıda olmalı
  kapakKare: 8,          // kapak durumu bu kadar kare tutarlıysa değişir
};
const oto = { iz: [], sonOlcum: -1e9, pozIlk: null, kapakSayac: 0, olcumBas: null };
function otoPilot(simdi, kt, markerler, arucoPoz) {
  if (!$("otoAc").checked) return;
  // sabitlik: küp taban izdüşümü (hangi poz varsa) son N karede ne kadar oynadı
  if (kt) oto.iz.push(kt); else oto.iz = [];
  if (oto.iz.length > OTO.sabitKare) oto.iz.shift();
  const sabit = oto.iz.length === OTO.sabitKare && Math.hypot(sd(oto.iz.map((p) => p.x)), sd(oto.iz.map((p) => p.y))) < OTO.sabitPx;
  // kamera kilidi: poz ilk oturduktan biraz sonra, bir kez
  if (kt && oto.pozIlk === null) oto.pozIlk = simdi;
  if (!kameraKilitlendi && oto.pozIlk !== null && simdi - oto.pozIlk > OTO.kilitGecikmeMs) kameraKilitle(false);
  // ölçüm: sabitken başlat, oynarsa iptal
  if (!olcum && sabit && simdi - oto.sonOlcum > OTO.olcumAraMs) { olcumBaslat("oto"); oto.olcumBas = kt; }
  if (olcum && olcum.neden === "oto" && kt && oto.olcumBas && Math.hypot(kt.x - oto.olcumBas.x, kt.y - oto.olcumBas.y) > OTO.olcumKaymaPx) {
    olayLog("olcum-iptal", { neden: "telefon oynadı", kare: olcum.kareler.length });
    olcum = null; oto.sonOlcum = simdi - OTO.olcumAraMs + 3000;   // 3 s sonra yeniden dene
    $("olc").textContent = "Ölç (" + OLCUM_KARE + " kare)"; $("olc").classList.remove("aktif");
  }
  // kalibrasyon: kalibre değilken, sabite yakın karede, eldekilerden farklı açıdaysa topla
  if (!kalib && arucoPoz && markerler.filter((m) => TABAN.merkez[m.id]).length >= 3 && oto.iz.length >= 5) {
    const r = Array.from(arucoPoz.rvec.data64F);
    const yeniAci = kalibGorunum.every((g) => aciFarki(rodrigues(g.r), rodrigues(r)) > OTO.kalibFarkDer);
    const azOynuyor = Math.hypot(sd(oto.iz.slice(-5).map((p) => p.x)), sd(oto.iz.slice(-5).map((p) => p.y))) < 2;
    if (yeniAci && azOynuyor) {
      kalibGorunumEkle(markerler, r); hamGoruntuIste("kalib");
      if (kalibGorunum.length >= OTO.kalibHedef) kalibHesapla();
    }
  }
}
function kapakOtomatik(kirmiziIcerde) {
  // kırmızı küp kutunun içinde görünüyorsa kapak çıkık; birkaç kare tutarlı olunca değiştir
  if (!$("otoAc").checked) return;
  const istenen = !kirmiziIcerde;
  if (istenen === kapakTakili) { oto.kapakSayac = 0; return; }
  if (++oto.kapakSayac < OTO.kapakKare) return;
  oto.kapakSayac = 0; kapakTakili = istenen;
  $("kapak").textContent = "Kapak: " + (kapakTakili ? "takılı" : "çıkık") + " (oto)";
  $("kapak").classList.toggle("aktif", kapakTakili);
  olayLog("kapak", { kapakTakili, otomatik: true });
  hamGoruntuIste("kapak");
}

// ====================== ANA DÖNGÜ ======================
function dongu(meta) {
  const simdi = performance.now(); fps = 0.9 * fps + 0.1 * (1000 / (simdi - sonZaman)); sonZaman = simdi;
  const tKare = meta && meta.captureTime ? meta.captureTime : simdi;   // 1€ için kare zamanı
  ctx.drawImage(video, 0, 0, ekran.width, ekran.height);
  if (!cvHazir) { kareBekle(); return; }
  islemCtx.drawImage(video, 0, 0, islemC.width, islemC.height);
  const src = cv.imread(islemC), gri = new cv.Mat();
  teshis = { goruntu: [islemC.width, islemC.height] };
  maske2C.width = 0;
  const s = ekran.width / islemC.width, W = islemC.width, H = islemC.height, m = mod();
  let bilgi = [], olcumYazi = "";
  const kayit = { ms: 0, aruco: null, markersiz: null };
  const asama = {};   // aşama süreleri (ms)
  let t0 = performance.now();
  try {
    cv.cvtColor(src, gri, cv.COLOR_RGBA2GRAY);
    goruntuKalitesi(gri, kayit);
    sonParlaklik = kayit.parlaklik;
    if (pozlamaKontrol && performance.now() - pozlamaKontrol.zaman > 800) {
      const k = pozlamaKontrol; pozlamaKontrol = null;
      if (k.once && kayit.parlaklik < 0.7 * k.once) {
        akis.getVideoTracks()[0].applyConstraints({ advanced: [{ exposureMode: "continuous" }] }).catch(() => {});
        $("kameraKilit").textContent += " · pozlama karardı, otomatiğe döndü";
        olayLog("pozlama-geri", { once: k.once, sonra: kayit.parlaklik });
      }
    }
    asama.hazirlik = performance.now() - t0; t0 = performance.now();
    let anaPoz = null;   // kırmızı küp ölçümü ve kalibrasyon bilgisi için öncelikli poz (aruco > markersız)
    let markerler = [], arucoPozu = null;

    // --- ArUco taban ---
    if (m !== "markersiz") {
      markerler = markerBul(gri);
      ctx.lineWidth = 2; ctx.font = `${Math.round(13 * s)}px system-ui`;
      for (const mk of markerler) {
        ctx.strokeStyle = TABAN.merkez[mk.id] ? "rgba(80,255,120,0.9)" : "rgba(255,80,80,0.9)";
        ctx.beginPath(); mk.kose.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x * s, p.y * s)); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle; ctx.fillText(String(mk.id), mk.kose[0].x * s, mk.kose[0].y * s - 4);
      }
      const poz = pozBulAruco(markerler, W, H);
      if (poz) {
        overlayCiz(poz, s, tKare, "a", "#36d6c3");
        const bilinen = markerler.filter((x) => TABAN.merkez[x.id]).sort((a, b) => a.id - b.id);
        kayit.aruco = kareKaydi(poz, poz.ids.join("-"), bilinen.flatMap((x) => x.kose));
        const t = poz.tvec.data64F;
        bilgi.push(`ARUCO ${poz.markerSayisi} marker [${poz.ids}] · FRE ${poz.fre.toFixed(2)} px · ${Math.hypot(t[0], t[1], t[2]).toFixed(0)} mm`);
        anaPoz = poz; arucoPozu = poz;
        if (kalibIste) { kalibIste = false; kalibGorunumEkle(markerler, Array.from(poz.rvec.data64F)); }
      } else { bilgi.push(`ARUCO: plaka marker'ı yok (${markerler.length} marker görüldü)`); cizimFiltre.akutu = cizimFiltre.azarf = cizimFiltre.akup = undefined; }
    }

    asama.aruco = performance.now() - t0; t0 = performance.now();
    // --- markersız ---
    if (m !== "aruco") {
      const tk = takipEt(src, gri, simdi);
      if (!tk) { oncekiPoz = null; cizimFiltre.mkutu = cizimFiltre.mzarf = cizimFiltre.mkup = undefined; }
      const kutu = tk && tk.kutu;
      ctx.globalAlpha = tk && tk.durum === "doğrulanmadı" ? 0.5 : 1;
      if (kutu) {
        if (tk.durum === "yeni") { oncekiPoz = null; cizimFiltre.mkutu = cizimFiltre.mzarf = cizimFiltre.mkup = undefined; }
        const poz = pozBulMarkersiz(kutu.kose, W, H);
        if (poz) {
          overlayCiz(poz, s, tKare, "m", m === "ikisi" ? "#ff5cf0" : "#36d6c3");
          // ölçüme yalnız bu karede gerçekten tespit edilmiş köşe girer (takip köprüsü değil)
          if (tk.durum === "yeni" || tk.durum === "doğrulandı") kayit.markersiz = kareKaydi(poz, kutu.yontem.split(",")[0], kutu.kose);
          const t = poz.tvec.data64F;
          bilgi.push(`MARKERSIZ ${tk.durum.toUpperCase()} · ${kutu.yontem} · ${Math.hypot(t[0], t[1], t[2]).toFixed(0)} mm` + (poz.olcumeUygun ? "" : " · ölçüme uygun değil (kapak çıkık)"));
          if (!anaPoz) anaPoz = poz; else pozSil(poz);
        }
        if (tk.durum === "yeni" || tk.durum === "doğrulandı") {   // sarı: tespitin BU karede gördüğü sınır
          ctx.strokeStyle = "rgba(255,230,0,0.9)"; ctx.lineWidth = 1.5; ctx.beginPath();
          for (let j = 0; j < kutu.kont.length; j += 2) (j ? ctx.lineTo : ctx.moveTo).call(ctx, kutu.kont[j] * s, kutu.kont[j + 1] * s);
          ctx.closePath(); ctx.stroke();
        }
        teshis.yontem = kutu.yontem; teshis.kose = kutu.kose; teshis.takip = tk.durum; teshis.nokta = kutu.pts.length / 2;
        ctx.fillStyle = "rgba(120,255,120,0.8)";   // izlenen noktalar
        for (let j = 0; j < kutu.pts.length; j += 2) ctx.fillRect(kutu.pts[j] * s - 2, kutu.pts[j + 1] * s - 2, 4, 4);
        ctx.fillStyle = "#36d6c3";
        for (const p of kutu.kose) { ctx.beginPath(); ctx.arc(p.x * s, p.y * s, 4, 0, 7); ctx.fill(); }
      } else bilgi.push("MARKERSIZ: kutu yok" + (teshis.reddedilen && teshis.reddedilen.length ? " (" + [...new Set(teshis.reddedilen)].join(", ") + ")" : ""));
      ctx.globalAlpha = 1;
      bilgi.push(`tespit %${Math.round(bulmaOrani * 100)}` + (kilit ? ` · ${kilit.pts.length / 2} nokta` : "") + (teshis.kilitBirakildi ? ` · kilit bırakıldı: ${teshis.kilitBirakildi}` : ""));
      if (!kilit) { // arama çerçevesi (yalnız kilit yokken)
        const b = aramaBolgesi(W, H);
        ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2; ctx.setLineDash([12, 8]);
        ctx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s); ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = `${Math.round(14 * s)}px system-ui`;
        ctx.fillText(`kutuyu buraya al · ${UZAK[0] / 10}-${UZAK[1] / 10} cm`, b.x * s, b.y * s - 6 * s);
      }
    }

    // --- kapak çıkıkken: kırmızı küpün yeri (ham poz, ışın-düzlem kesişimi) ---
    asama.markersiz = performance.now() - t0; t0 = performance.now();
    const kir = anaPoz ? kirmiziBul(src) : null, kirYer = kir ? kupYeri(anaPoz, kir) : null;
    if (anaPoz) kapakOtomatik(!!(kirYer && Math.abs(kirYer.x) < G.ic / 2 + 2 && Math.abs(kirYer.y) < G.ic / 2 + 2));
    if (anaPoz && !kapakTakili) {
      if (kir) {
        const yer = kirYer, tahmin = yansit(anaPoz, [[0, 0, G.kup]])[0];
        ctx.strokeStyle = "#ff4d4d"; ctx.lineWidth = 3; ctx.beginPath();
        for (let j = 0; j < kir.kont.length; j += 2) (j ? ctx.lineTo : ctx.moveTo).call(ctx, kir.kont[j] * s, kir.kont[j + 1] * s);
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = "#ffb347"; ctx.beginPath(); ctx.arc(kir.x * s, kir.y * s, 6, 0, 7); ctx.fill();
        ctx.strokeStyle = "#ffb347"; ctx.beginPath(); ctx.moveTo(kir.x * s, kir.y * s); ctx.lineTo(tahmin.x * s, tahmin.y * s); ctx.stroke();
        if (yer) {
          const fark = Math.hypot(yer.x, yer.y);
          teshis.kirmizi = { px: [kir.x, kir.y], yerMm: [yer.x, yer.y], farkMm: fark };
          olcumYazi = `küp yer değiştirme tahmini (doğrulanmamış): ${fark.toFixed(1)} mm  (x ${yer.x.toFixed(1)}, y ${yer.y.toFixed(1)})` +
            (anaPoz.olcumeUygun ? "" : " · markersız+kapak çıkık: yanlı");
        }
      } else olcumYazi = "kırmızı küp görünmüyor";
    }
    asama.kirmizi = performance.now() - t0;
    if (kirYer) kayit.kirmizi = { px: [+kir.x.toFixed(2), +kir.y.toFixed(2)], yerMm: [+kirYer.x.toFixed(2), +kirYer.y.toFixed(2)] };
    otoPilot(simdi, anaPoz ? yansit(anaPoz, [[0, 0, 0]])[0] : null, markerler, arucoPozu);
    if (anaPoz) {
      teshis.tvec = Array.from(anaPoz.tvec.data64F).map((v) => +v.toFixed(1)); teshis.rvec = Array.from(anaPoz.rvec.data64F).map((v) => +v.toFixed(3));
      pozSil(anaPoz);
    }
  } catch (e) { bilgi.push("hata: " + (typeof e === "number" ? cv.exceptionFromPtr(e).msg : e.message || e)); }
  kayit.ms = performance.now() - simdi;
  islenenKare++;
  olcumKaydet(kayit);
  kareLog({
    mod: m, ms: +kayit.ms.toFixed(1), asama: Object.fromEntries(Object.entries(asama).map(([k, v]) => [k, +v.toFixed(1)])),
    fps: +fps.toFixed(1), kare: meta ? { yakalama: meta.captureTime, medya: meta.mediaTime, sunulan: meta.presentedFrames } : null,
    parlaklik: kayit.parlaklik, bulaniklik: kayit.bulaniklik, hareket: hareketAl(), kameraAyar: kameraAyarDegisimi(),
    kapakTakili, olcumde: !!olcum, arucoRed: teshis.arucoRed, esik: teshis.esik1, reddedilen: teshis.reddedilen && [...new Set(teshis.reddedilen)],
    durum: bilgi, aruco: kayit.aruco, markersiz: kayit.markersiz, kirmizi: kayit.kirmizi,
  }, !!olcum);
  hamGoruntuKontrol(simdi);
  if (gri.cols) { if (oncekiGri) oncekiGri.delete(); oncekiGri = gri; } else gri.delete();
  src.delete();
  if (olcumYazi) $("olcum").textContent = olcumYazi; else $("olcum").textContent = "";
  teshis.durum = bilgi.join(" | ");
  if (tekKare) { tekKare = false; teshisPaylas(); }
  durum(`${SURUM} · ${bilgi.join("\n")}\nFPS ${fps.toFixed(0)} · ${kayit.ms.toFixed(0)} ms/kare · ${ekran.width}×${ekran.height} · ${kalib && kalib.w === W ? "kalibre" : "FOV " + $("fov").value + "°"}`);
  kareBekle();
}
