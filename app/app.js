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

const $ = (id) => document.getElementById(id);
const ekran = $("ekran"), ctx = ekran.getContext("2d");
const maskeC = $("maske");
const islemC = document.createElement("canvas"), islemCtx = islemC.getContext("2d", { willReadFrequently: true });
const video = document.createElement("video");
video.playsInline = true; video.muted = true;

let cvHazir = false, akis = null;
let kapakTakili = true, maskeGoster = false;
let sonZaman = performance.now(), fps = 0;

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

function kutuBul(src) {
  // koyu nesne (kutu + kapak) beyaz kağıt üzerinde -> en büyük dörtgen
  const gri = new cv.Mat(), ikili = new cv.Mat(), kont = new cv.MatVector(), hiy = new cv.Mat();
  let sonuc = null;
  try {
    cv.cvtColor(src, gri, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gri, gri, new cv.Size(5, 5), 0);
    const oto = $("otomatik").checked;
    const t = cv.threshold(gri, ikili, +$("esik").value, 255, cv.THRESH_BINARY_INV | (oto ? cv.THRESH_OTSU : 0));
    if (oto) { $("esik").value = Math.round(t); $("esikV").textContent = Math.round(t); }
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    cv.morphologyEx(ikili, ikili, cv.MORPH_CLOSE, k); k.delete();
    if (maskeGoster) cv.imshow(maskeC, ikili);
    cv.findContours(ikili, kont, hiy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let enIyi = -1, enAlan = src.rows * src.cols * 0.003;
    for (let i = 0; i < kont.size(); i++) {
      const a = cv.contourArea(kont.get(i));
      if (a > enAlan && a < src.rows * src.cols * 0.8) { enAlan = a; enIyi = i; }
    }
    if (enIyi >= 0) {
      const c = kont.get(enIyi), yak = new cv.Mat();
      const silAlan = enAlan;
      // önce gri kapağı ara: silüet içinde siyah duvardan açık kalan bölge = üst yüz
      const ust = kapakTakili ? ustYuzBul(gri, c, silAlan) : null;
      if (ust) { yak.delete(); return { kose: koseSirala(ust), yontem: "gri kapak", kont: c.data32S.slice() }; }
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
    if (n < 200) { k.delete(); silTam.delete(); return null; }
    let top = 0; for (let i = 0; i < 256; i++) top += i * hist[i];
    let wB = 0, sB = 0, enIyiV = -1, t2 = 0, m0 = 0, m1 = 0;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (top - sB) / wF, v = wB * wF * (mB - mF) ** 2;
      if (v > enIyiV) { enIyiV = v; t2 = i; m0 = mB; m1 = mF; }
    }
    if (m1 - m0 < 25) { k.delete(); silTam.delete(); return null; }   // kapak ile duvar ayrışmıyor
    cv.threshold(gri, acik, t2, 255, cv.THRESH_BINARY);
    cv.bitwise_and(acik, sil, acik);
    cv.morphologyEx(acik, acik, cv.MORPH_CLOSE, k);
    cv.morphologyEx(acik, acik, cv.MORPH_OPEN, k);
    cv.dilate(acik, acik, k); cv.bitwise_and(acik, silTam, acik);   // aşındırma kaymasını geri al
    k.delete(); silTam.delete();
    if (maskeGoster) cv.imshow(maskeC, acik);
    cv.findContours(acik, kont, hiy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let enIyi = -1, enAlan = silAlan * 0.25;
    for (let i = 0; i < kont.size(); i++) { const a = cv.contourArea(kont.get(i)); if (a > enAlan) { enAlan = a; enIyi = i; } }
    if (enIyi < 0) return null;
    const ck = kont.get(enIyi);
    cv.approxPolyDP(ck, yak, 0.04 * cv.arcLength(ck, true), true);
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
    let enIyi = -1, enAlan = 60;
    for (let i = 0; i < kont.size(); i++) { const a = cv.contourArea(kont.get(i)); if (a > enAlan) { enAlan = a; enIyi = i; } }
    if (enIyi >= 0) {
      const mo = cv.moments(kont.get(enIyi));
      sonuc = { x: mo.m10 / mo.m00, y: mo.m01 / mo.m00, kont: kont.get(enIyi).data32S.slice() };
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
  const src = cv.imread(islemC);
  const s = ekran.width / islemC.width;
  let bilgi = "", olcum = "";
  try {
    const kutu = kutuBul(src);
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
            olcum = `fark ≈ ${farkMm.toFixed(1)} mm (yaklaşık, üstten bakışta)`;
          } else olcum = "kırmızı küp görünmüyor";
        }
        const t = poz.tvec.data64F;
        bilgi = `kutu: ${kutu.yontem}, uzaklık ${Math.hypot(t[0], t[1], t[2]).toFixed(0)} mm`;
        poz.rvec.delete(); poz.tvec.delete(); poz.K.delete(); poz.D.delete();
      }
      // seçilen silüet (sarı ince): neyi kutu sandığını göster
      ctx.strokeStyle = "rgba(255,230,0,0.9)"; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let j = 0; j < kutu.kont.length; j += 2) (j ? ctx.lineTo : ctx.moveTo).call(ctx, kutu.kont[j] * s, kutu.kont[j + 1] * s);
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = "#36d6c3";
      for (const p of kutu.kose) { ctx.beginPath(); ctx.arc(p.x * s, p.y * s, 5, 0, 7); ctx.fill(); }
    } else bilgi = "kutu bulunamadı (beyaz kağıt üstünde mi?)";
  } catch (e) { bilgi = "hata: " + (e.message || e); }
  src.delete();
  $("olcum").textContent = olcum;
  durum(`${bilgi}\nFPS ${fps.toFixed(0)} · görüntü ${ekran.width}×${ekran.height}`);
  requestAnimationFrame(dongu);
}
