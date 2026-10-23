// Aşama 0 v0: markersız kutu takibi + iç küp overlay.
// Yöntem: beyaz kağıt üstündeki koyu kutunun üst yüz karesini bul -> 4 köşe -> solvePnP (IPPE_SQUARE)
// -> kutu koordinatındaki küpü projectPoints ile çiz. Kapak çıkınca kırmızı küpü bulup farkı ölç.
// Geometri ../asama0/v2/geometri.json ile aynı (mm, iç taban z=0).

const G = {
  dis: 30,            // kutu dış kenar (kapak da 30)
  ic: 22,             // iç boşluk
  tabanT: 2.5,        // iç tabanın altındaki kalınlık
  duvarUst: 24,       // iç tabandan duvar üstüne
  kapakUst: 26,       // kapak takılıyken üst yüz
  kup: 15,            // küp kenarı, ortada
};
const ISLEM_G = 640;  // işlem genişliği (px)
const BOLGE = 0.6;              // arama çerçevesi: kısa kenarın oranı, ekran ortasında
const UZAK = [120, 350];        // kabul edilen kamera-kutu uzaklığı (mm)

const $ = (id) => document.getElementById(id);
const ekran = $("ekran"), ctx = ekran.getContext("2d");
const maskeC = $("maske");
const maske2C = document.createElement("canvas");   // kapak maskesi (yalnız kayıt için)
const islemC = document.createElement("canvas"), islemCtx = islemC.getContext("2d", { willReadFrequently: true });
const video = document.createElement("video");
video.playsInline = true; video.muted = true;

let cvHazir = false, akis = null;
let kapakTakili = true, maskeGoster = false;
let sonZaman = performance.now(), fps = 0;
let kayitHata = "";
let kayitAcik = false, kayitSon = 0, kayitSayi = 0, teshis = {};
const KAYIT_ARALIK = 3000;   // ms
// GitHub Pages'ten açılınca kayıtlar laptoptaki server.py'ye gider (aynı Wi-Fi)
const KAYIT_ADRES = location.hostname.endsWith("github.io") ? "https://192.168.1.185:8443/kayit" : "kayit";
let tekKare = false;   // Teşhis düğmesi: bir karede maskeleri çiz, sonra kolaj yap
const maskeCiz = () => maskeGoster || kayitAcik || tekKare;

function cvYuklendi() {
  const bitti = () => { cvHazir = true; durum("OpenCV hazır. Kamerayı başlat."); };
  if (cv.getBuildInformation) bitti(); else cv.onRuntimeInitialized = bitti;
}
function durum(t) { $("durum").textContent = t; }

$("basla").onclick = async () => {
  try {
    akis = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
  } catch (e) { durum("Kamera açılamadı: " + e.message + "\n(HTTPS ile açtığından emin ol)"); return; }
  video.srcObject = akis; await video.play();
  ekran.width = video.videoWidth; ekran.height = video.videoHeight;
  islemC.width = ISLEM_G; islemC.height = Math.round(ISLEM_G * video.videoHeight / video.videoWidth);
  maskeC.width = islemC.width; maskeC.height = islemC.height;
  $("basla").textContent = "Çalışıyor"; requestAnimationFrame(dongu);
};
$("kapak").onclick = (e) => {
  kapakTakili = !kapakTakili;
  e.target.textContent = "Kapak: " + (kapakTakili ? "takılı" : "çıkık");
  e.target.classList.toggle("aktif", kapakTakili);
};
$("maskeBtn").onclick = (e) => {
  maskeGoster = !maskeGoster; maskeC.style.display = maskeGoster ? "block" : "none";
  e.target.classList.toggle("aktif", maskeGoster);
};
$("odak").onclick = async () => {
  const iz = akis && akis.getVideoTracks()[0];
  if (!iz) return;
  const yet = iz.getCapabilities ? iz.getCapabilities() : {};
  const modlar = yet.focusMode || [];
  try {
    if (modlar.includes("manual")) await iz.applyConstraints({ advanced: [{ focusMode: "manual" }] });
    else if (modlar.includes("single-shot")) await iz.applyConstraints({ advanced: [{ focusMode: "single-shot" }] });
    else { durum("Bu tarayıcı odak kilidini desteklemiyor. Desteklenen: " + (modlar.join(", ") || "yok")); return; }
    $("odak").classList.add("aktif"); $("odak").textContent = "Odak kilitli";
  } catch (e) { durum("Odak kilitlenemedi: " + e.message); }
};
$("kayit").onclick = (e) => {
  kayitAcik = !kayitAcik; kayitSon = 0; kayitHata = "";
  e.target.classList.toggle("aktif", kayitAcik);
  e.target.textContent = kayitAcik ? "Kayıt: açık" : "Kayıt";
};

let kayitGidiyor = false;
async function kaydet() {
  // ham kare + overlay'li ekran + maskeler + sayılar -> laptoptaki server.py (/kayit)
  if (kayitGidiyor) return;
  kayitGidiyor = true;
  try {
    const ham = document.createElement("canvas");
    ham.width = video.videoWidth; ham.height = video.videoHeight;
    ham.getContext("2d").drawImage(video, 0, 0);
    const gorseller = { ham: ham.toDataURL("image/jpeg", 0.9), ekran: ekran.toDataURL("image/jpeg", 0.8), maske: maskeC.toDataURL("image/png") };
    if (maske2C.width) gorseller.kapakMaske = maske2C.toDataURL("image/png");
    const iz = akis.getVideoTracks()[0];
    const bilgi = { ...teshis, kapakTakili, fov: +$("fov").value, otomatikEsik: $("otomatik").checked,
      kamera: iz.getSettings ? iz.getSettings() : null, tarayici: navigator.userAgent, zaman: new Date().toISOString() };
    const y = await fetch(KAYIT_ADRES, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bilgi, gorseller }) });
    if (!y.ok) throw new Error("sunucu " + y.status);
    kayitSayi++;
  } catch (e) {
    kayitAcik = false; $("kayit").classList.remove("aktif"); $("kayit").textContent = "Kayıt";
    kayitHata = "Kayıt gönderilemedi: " + e.message + " (aynı Wi-Fi'da mısın? önce https://192.168.1.185:8443 adresini bir kez açıp uyarıyı geç)";
  } finally { kayitGidiyor = false; }
}

$("kilitBirak").onclick = () => { kilit = null; };
$("teshis").onclick = () => { if (akis) tekKare = true; };

async function teshisPaylas() {
  // ekran + silüet maskesi + kapak maskesi + sayılar -> tek PNG -> paylaş menüsü
  const W = ekran.width, mw = Math.round(W / 2), mh = Math.round(mw * maskeC.height / maskeC.width);
  const satirlar = JSON.stringify({ ...teshis, kapakTakili, fov: +$("fov").value }, (k, v) =>
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
  const dosya = new File([blob], "teshis.png", { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [dosya] })) { await navigator.share({ files: [dosya] }); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "teshis.png"; a.click();
}

for (const [id, v] of [["esik", "esikV"], ["fov", "fovV"]]) $(id).oninput = () => ($(v).textContent = $(id).value);

// --- yardımcılar ---
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

function kutuBul(src, alan) {
  // koyu nesne (kutu + kapak) beyaz kağıt üzerinde -> en büyük dörtgen
  const gri = new cv.Mat(), ikili = new cv.Mat(), kont = new cv.MatVector(), hiy = new cv.Mat();
  let sonuc = null;
  try {
    cv.cvtColor(src, gri, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gri, gri, new cv.Size(5, 5), 0);
    const oto = $("otomatik").checked;
    // sahnede 3 ton var (kağıt, gri kapak, siyah duvar); Otsu bazen gri ile siyahı ayırıyor.
    // Kutu çerçeve kenarına değemez -> kenar şeridi = kağıt; eşiği kağıdın parlaklığından kur.
    let t = +$("esik").value;
    if (oto) {
      const kagit = kenarMedyan(gri);
      t = Math.round(kagit * 0.8);   // metalik kapak kağıda yakın parlayabiliyor
      teshis.kagit = kagit;
      $("esik").value = t; $("esikV").textContent = t;
    }
    cv.threshold(gri, ikili, t, 255, cv.THRESH_BINARY_INV);
    teshis.esik1 = t;
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    cv.morphologyEx(ikili, ikili, cv.MORPH_CLOSE, k); k.delete();
    if (maskeCiz()) cv.imshow(maskeC, ikili);
    cv.findContours(ikili, kont, hiy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let enIyi = -1, enAlan = alan[0], reddedilen = [];
    for (let i = 0; i < kont.size(); i++) {
      const c = kont.get(i), a = cv.contourArea(c);
      const r = cv.boundingRect(c); c.delete();
      if (a < 100) continue;
      const kenaraDegiyor = r.x <= 1 || r.y <= 1 || r.x + r.width >= src.cols - 1 || r.y + r.height >= src.rows - 1;
      if (kenaraDegiyor) { reddedilen.push("çerçeveye değiyor"); continue; }
      if (a > alan[1]) { reddedilen.push("çok büyük/yakın"); continue; }
      if (a < alan[0]) { if (a > alan[0] * 0.3) reddedilen.push("çok küçük/uzak"); continue; }
      if (a > enAlan) { enAlan = a; enIyi = i; }
    }
    teshis.reddedilen = reddedilen;
    if (enIyi >= 0) {
      const c = kont.get(enIyi), yak = new cv.Mat();
      const silAlan = enAlan;
      teshis.silAlan = silAlan; teshis.silKont = c.data32S.length / 2;
      // önce gri kapağı ara: silüet içinde siyah duvardan açık kalan bölge = üst yüz
      const ust = kapakTakili ? ustYuzBul(gri, c, silAlan) : null;
      if (ust) { yak.delete(); const kd = c.data32S.slice(); c.delete(); return { kose: koseSirala(ust), yontem: "gri kapak", kont: kd }; }
      cv.approxPolyDP(c, yak, 0.04 * cv.arcLength(c, true), true);
      let pts = [], yontem;
      if (yak.rows === 4 && cv.isContourConvex(yak)) {
        for (let i = 0; i < 4; i++) pts.push({ x: yak.data32S[i * 2], y: yak.data32S[i * 2 + 1] });
        yontem = "dörtgen";
      } else {
        const r = cv.minAreaRect(c);
        pts = cv.RotatedRect.points(r).map((p) => ({ x: p.x, y: p.y }));
        yontem = `en küçük dikdörtgen (${yak.rows} köşe bulundu)`;
      }
      yak.delete();
      sonuc = { kose: koseSirala(pts), yontem: "silüet, " + yontem, kont: c.data32S.slice() };
      c.delete();
    }
  } finally { gri.delete(); ikili.delete(); kont.delete(); hiy.delete(); }
  return sonuc;
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
    if (m1 - m0 < 25) { k.delete(); silTam.delete(); return null; }   // kapak ile duvar ayrışmıyor
    cv.threshold(gri, acik, t2, 255, cv.THRESH_BINARY);
    cv.bitwise_and(acik, sil, acik);
    cv.morphologyEx(acik, acik, cv.MORPH_CLOSE, k);
    cv.morphologyEx(acik, acik, cv.MORPH_OPEN, k);
    cv.dilate(acik, acik, k); cv.bitwise_and(acik, silTam, acik);   // aşındırma kaymasını geri al
    k.delete(); silTam.delete();
    if (kayitAcik || tekKare) { maske2C.width = acik.cols; maske2C.height = acik.rows; cv.imshow(maske2C, acik); }
    cv.findContours(acik, kont, hiy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const [enIyi, enAlan] = enBuyukKontur(kont, silAlan * 0.25);
    if (enIyi < 0) { teshis.kapak.red = "yeterli büyük açık bölge yok"; return null; }
    const ck = kont.get(enIyi);
    cv.approxPolyDP(ck, yak, 0.04 * cv.arcLength(ck, true), true); ck.delete();
    teshis.kapak.alan = enAlan; teshis.kapak.koseSayi = yak.rows;
    if (yak.rows !== 4 || !cv.isContourConvex(yak)) return null;
    const pts = []; for (let i = 0; i < 4; i++) pts.push({ x: yak.data32S[i * 2], y: yak.data32S[i * 2 + 1] });
    return pts;
  } finally { sil.delete(); acik.delete(); mv.delete(); kont.delete(); hiy.delete(); yak.delete(); }
}

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

function pozBul(kose, w, h) {
  const L = G.dis;
  const obj = cv.matFromArray(4, 3, cv.CV_64F, [-L / 2, L / 2, 0, L / 2, L / 2, 0, L / 2, -L / 2, 0, -L / 2, -L / 2, 0]);
  const img = cv.matFromArray(4, 2, cv.CV_64F, kose.flatMap((p) => [p.x, p.y]));
  const f = (w / 2) / Math.tan((+$("fov").value * Math.PI / 180) / 2);
  const K = cv.matFromArray(3, 3, cv.CV_64F, [f, 0, w / 2, 0, f, h / 2, 0, 0, 1]);
  const D = cv.Mat.zeros(4, 1, cv.CV_64F), rvec = new cv.Mat(), tvec = new cv.Mat();
  const ok = cv.solvePnP(obj, img, K, D, rvec, tvec, false, cv.SOLVEPNP_IPPE_SQUARE);
  obj.delete(); img.delete();
  return ok ? { rvec, tvec, K, D } : (rvec.delete(), tvec.delete(), K.delete(), D.delete(), null);
}

function yansit(poz, noktalarKutu, ustZ) {
  // kutu koordinatı (iç taban z=0) -> üst kare çerçevesi (z kameraya doğru) -> piksel
  const p = cv.matFromArray(noktalarKutu.length, 3, cv.CV_64F, noktalarKutu.flatMap(([x, y, z]) => [x, y, z - ustZ]));
  const out = new cv.Mat();
  cv.projectPoints(p, poz.rvec, poz.tvec, poz.K, poz.D, out);
  const r = []; for (let i = 0; i < noktalarKutu.length; i++) r.push({ x: out.data64F[i * 2], y: out.data64F[i * 2 + 1] });
  p.delete(); out.delete(); return r;
}

function kutuKoseleri(x0, x1, y0, y1, z0, z1) {
  return [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
}
const KENARLAR = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

// --- kilit + takip + doğrulama ---
// Kutu bir kez bulununca kilitlenir. Her karede kutu üstündeki/kenarındaki noktalar optik akışla
// izlenir (homografi -> köşeler). Tespit, kutunun son yerinin çevresinde arka planda çalışır ve
// bulduğunda takibi düzeltir (kayma birikmesin). Kilit yalnız kutu ekrandan çıkınca ya da
// noktalar kaybolunca bırakılır.
const TAKIP = {
  enAzNokta: 6,          // homografi için gereken en az iyi nokta
  yenileAlti: 15,        // nokta sayısı bunun altına inince yeniden seç
  dogrulaHarmani: 0.5,   // tespit bulunca köşeleri ona doğru ne kadar çek
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
const alanK = (k) => Math.abs(k.reduce((t, p, i) => { const q = k[(i + 1) % 4]; return t + p.x * q.y - q.x * p.y; }, 0)) / 2;

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
  if (kilit && oncekiGri && !akisIzle(gri)) { kilit = null; teshis.kilitBirakildi = "noktalar kayboldu"; }
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
    if (d < kenarUz(kilit.kose) * 0.35) {
      const a = TAKIP.dogrulaHarmani;
      kilit.kose = esli.map((p, i) => ({ x: a * p.x + (1 - a) * kilit.kose[i].x, y: a * p.y + (1 - a) * kilit.kose[i].y }));
      kilit.kont = tespit.kont; kilit.yontem = tespit.yontem; kilit.dogrulandi = simdi; kilit.uyusmaz = 0;
      if (kilit.pts.length / 2 < TAKIP.yenileAlti) kilit.pts = noktaSec(gri, kilit.kose);
      return { kutu: kilit, durum: "doğrulandı" };
    }
    if (++kilit.uyusmaz > TAKIP.uyusmazSiniri) {
      kilit = yeniKilit(tespit, gri, simdi);
      return { kutu: kilit, durum: "yeni" };
    }
  }
  if (kilit.pts.length / 2 < TAKIP.yenileAlti) kilit.pts = noktaSec(gri, kilit.kose);
  return { kutu: kilit, durum: simdi - kilit.dogrulandi > TAKIP.bayatMs ? "doğrulanmadı" : "takipte" };
}

function telKafes(p, s, renk, kalinlik, kesik) {
  ctx.strokeStyle = renk; ctx.lineWidth = kalinlik; ctx.setLineDash(kesik ? [8, 6] : []);
  ctx.beginPath();
  for (const [a, b] of KENARLAR) { ctx.moveTo(p[a].x * s, p[a].y * s); ctx.lineTo(p[b].x * s, p[b].y * s); }
  ctx.stroke(); ctx.setLineDash([]);
}

function dongu() {
  const simdi = performance.now(); fps = 0.9 * fps + 0.1 * (1000 / (simdi - sonZaman)); sonZaman = simdi;
  ctx.drawImage(video, 0, 0, ekran.width, ekran.height);
  if (!cvHazir) { requestAnimationFrame(dongu); return; }
  islemCtx.drawImage(video, 0, 0, islemC.width, islemC.height);
  const src = cv.imread(islemC), gri = new cv.Mat();
  teshis = { goruntu: [islemC.width, islemC.height] };
  maske2C.width = 0;
  const s = ekran.width / islemC.width;
  let bilgi = "", olcum = "";
  try {
    cv.cvtColor(src, gri, cv.COLOR_RGBA2GRAY);
    const tk = takipEt(src, gri, simdi);
    const kutu = tk && tk.kutu;
    ctx.globalAlpha = tk && tk.durum === "doğrulanmadı" ? 0.5 : 1;
    if (kutu) {
      const ustZ = kapakTakili ? G.kapakUst : G.duvarUst;
      const poz = pozBul(kutu.kose, islemC.width, islemC.height);
      if (poz) {
        const d = G.dis / 2, i = G.ic / 2, k = G.kup / 2;
        telKafes(yansit(poz, kutuKoseleri(-d, d, -d, d, -G.tabanT, ustZ), ustZ), s, "rgba(200,210,220,0.55)", 2, false);
        telKafes(yansit(poz, kutuKoseleri(-i, i, -i, i, 0, G.ic), ustZ), s, "rgba(255,179,71,0.8)", 2, true);  // zarf
        const kupP = yansit(poz, kutuKoseleri(-k, k, -k, k, 0, G.kup), ustZ);
        telKafes(kupP, s, "#36d6c3", 3, false);
        if (!kapakTakili) {
          const kir = kirmiziBul(src);
          if (kir) {
            const tahmin = yansit(poz, [[0, 0, G.kup]], ustZ)[0];   // küp üst yüz merkezi
            const kenarPx = Math.hypot(kutu.kose[0].x - kutu.kose[1].x, kutu.kose[0].y - kutu.kose[1].y);
            const mmPx = G.dis / kenarPx;
            const farkMm = Math.hypot(kir.x - tahmin.x, kir.y - tahmin.y) * mmPx;
            ctx.strokeStyle = "#ff4d4d"; ctx.lineWidth = 3; ctx.beginPath();
            for (let j = 0; j < kir.kont.length; j += 2) (j ? ctx.lineTo : ctx.moveTo).call(ctx, kir.kont[j] * s, kir.kont[j + 1] * s);
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle = "#ffb347"; ctx.beginPath(); ctx.arc(kir.x * s, kir.y * s, 6, 0, 7); ctx.fill();
            ctx.strokeStyle = "#ffb347"; ctx.beginPath(); ctx.moveTo(kir.x * s, kir.y * s); ctx.lineTo(tahmin.x * s, tahmin.y * s); ctx.stroke();
            teshis.kirmizi = { merkez: [kir.x, kir.y], tahmin: [tahmin.x, tahmin.y], farkMm };
            olcum = `fark ≈ ${farkMm.toFixed(1)} mm (yaklaşık, üstten bakışta)`;
          } else olcum = "kırmızı küp görünmüyor";
        }
        const t = poz.tvec.data64F;
        teshis.tvec = Array.from(t).map((v) => +v.toFixed(1)); teshis.rvec = Array.from(poz.rvec.data64F).map((v) => +v.toFixed(3));
        bilgi = `${tk.durum.toUpperCase()} · kutu: ${kutu.yontem}, uzaklık ${Math.hypot(t[0], t[1], t[2]).toFixed(0)} mm`;
        poz.rvec.delete(); poz.tvec.delete(); poz.K.delete(); poz.D.delete();
      }
      // seçilen silüet (sarı ince): neyi kutu sandığını göster
      ctx.strokeStyle = "rgba(255,230,0,0.9)"; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let j = 0; j < kutu.kont.length; j += 2) (j ? ctx.lineTo : ctx.moveTo).call(ctx, kutu.kont[j] * s, kutu.kont[j + 1] * s);
      ctx.closePath(); ctx.stroke();
      teshis.yontem = kutu.yontem; teshis.kose = kutu.kose; teshis.takip = tk.durum; teshis.nokta = kutu.pts.length / 2;
      ctx.fillStyle = "rgba(120,255,120,0.8)";   // izlenen noktalar
      for (let j = 0; j < kutu.pts.length; j += 2) ctx.fillRect(kutu.pts[j] * s - 2, kutu.pts[j + 1] * s - 2, 4, 4);
      ctx.fillStyle = "#36d6c3";
      for (const p of kutu.kose) { ctx.beginPath(); ctx.arc(p.x * s, p.y * s, 5, 0, 7); ctx.fill(); }
    } else bilgi = "kutu bulunamadı" + (teshis.reddedilen && teshis.reddedilen.length ? " (" + [...new Set(teshis.reddedilen)].join(", ") + ")" : ": çerçevenin içine al");
  } catch (e) { bilgi = "hata: " + (e.message || e); }
  ctx.globalAlpha = 1;
  bilgi += ` · tespit %${Math.round(bulmaOrani * 100)}` + (kilit ? ` · ${kilit.pts.length / 2} nokta` : "") + (teshis.kilitBirakildi ? ` · kilit bırakıldı: ${teshis.kilitBirakildi}` : "");
  if (gri.cols) { if (oncekiGri) oncekiGri.delete(); oncekiGri = gri; } else gri.delete();
  if (!kilit) { // arama çerçevesi (yalnız kilit yokken)
    const b = aramaBolgesi(islemC.width, islemC.height);
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 2; ctx.setLineDash([12, 8]);
    ctx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = `${Math.round(14 * s)}px system-ui`;
    ctx.fillText(`kutuyu buraya al · ${UZAK[0] / 10}-${UZAK[1] / 10} cm`, b.x * s, b.y * s - 6 * s);
  }
  src.delete();
  $("olcum").textContent = olcum;
  teshis.durum = bilgi;
  if (tekKare) { tekKare = false; teshisPaylas(); }
  if (kayitAcik && simdi - kayitSon > KAYIT_ARALIK) { kayitSon = simdi; kaydet(); }
  durum(`${bilgi}\nFPS ${fps.toFixed(0)} · görüntü ${ekran.width}×${ekran.height}` + (kayitAcik ? ` · kayıt ${kayitSayi}` : "") + (kayitHata ? "\n" + kayitHata : ""));
  requestAnimationFrame(dongu);
}
