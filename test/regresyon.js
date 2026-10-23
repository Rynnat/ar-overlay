// Regresyon testleri: her yayından ÖNCE çalışır, biri bile kalırsa yayın yok.
//   node test/regresyon.js
// Bugüne kadar bulunan her hata burada bir test olarak durur (bir daha geri gelmesin).
// Tarayıcı yerine Node + opencv.js; sahneler bilinen pozla sentetik çizilir.
const vm = require("vm"), fs = require("fs"), path = require("path");
const APP = path.join(__dirname, "..", "app");

// --- tarayıcı taklidi ---
const el = () => ({ getContext: () => new Proxy({}, { get: () => () => {} }), style: {}, classList: { add() {}, toggle() {}, remove() {} },
  checked: true, value: "65", textContent: "", width: 0, height: 0 });
const els = {};
let cagrilar = new Map(), cagriId = 0;
const iz = { stop() {}, getSettings: () => ({}), getCapabilities: () => ({}), applyConstraints: async () => {} };
const video = { requestVideoFrameCallback: (f) => { cagrilar.set(++cagriId, f); return cagriId; }, cancelVideoFrameCallback: (i) => cagrilar.delete(i),
  play: async () => {}, videoWidth: 640, videoHeight: 360, srcObject: null };
global.document = { getElementById: (id) => (els[id] ||= el()), createElement: (t) => (t === "video" ? video : el()), title: "", addEventListener() {}, visibilityState: "visible" };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "node",
  mediaDevices: { getUserMedia: async () => ({ getTracks: () => [iz], getVideoTracks: () => [iz] }) } } });
Object.assign(global, { window: { addEventListener() {} }, screen: {}, devicePixelRatio: 1, setInterval: () => 0,
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, location: { hostname: "x", hash: "", pathname: "/", search: "" },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, history: { replaceState() {} } });
global.performance = require("perf_hooks").performance;
global.cv = require(path.join(APP, "vendor", "opencv.js"));
const calistir = (kod) => vm.runInThisContext(kod);

const sonuclar = [];
function kontrol(ad, kosul, ayrinti) { sonuclar.push({ ad, ok: !!kosul, ayrinti }); }

async function testler() {
  calistir(fs.readFileSync(path.join(APP, "kayit.js"), "utf8"));
  calistir(fs.readFileSync(path.join(APP, "app.js"), "utf8"));
  calistir("arucoHazirla()");
  await new Promise((r) => setTimeout(r, 20));   // sayfa açılışındaki otomatik kamera başlatma

  const W = 640, H = 360, f = 520, Kd = [f, 0, W / 2, 0, f, H / 2, 0, 0, 1];
  calistir(`kalib = { w: ${W}, h: ${H}, K: ${JSON.stringify(Kd)}, D: [0,0,0,0,0], rms: 0, gorunum: 0 }`);
  const Kg = cv.matFromArray(3, 3, cv.CV_64F, Kd), Dg = cv.Mat.zeros(5, 1, cv.CV_64F);
  const izdusum = (r, t) => { const rM = cv.matFromArray(3, 1, cv.CV_64F, r), tM = cv.matFromArray(3, 1, cv.CV_64F, t);
    return (pts) => { const o = cv.matFromArray(pts.length, 3, cv.CV_64F, pts.flat()), out = new cv.Mat(); cv.projectPoints(o, rM, tM, Kg, Dg, out);
      const s = []; for (let i = 0; i < pts.length; i++) s.push([out.data64F[2 * i], out.data64F[2 * i + 1]]); o.delete(); out.delete(); return s; }; };
  const zemin = () => new cv.Mat(H, W, cv.CV_8UC4, new cv.Scalar(232, 232, 228, 255));
  const doldur = (src, pts, col) => { const p = pts.map(([x, y]) => [Math.round(x), Math.round(y)]); const m = cv.matFromArray(p.length, 1, cv.CV_32SC2, p.flat()); const v = new cv.MatVector(); v.push_back(m); cv.fillPoly(src, v, col); m.delete(); v.delete(); };
  const sahne = (izd, gurultu = 0) => {
    const src = zemin(), dict = cv.getPredefinedDictionary(cv.DICT_4X4_50);
    for (const id of [10, 11, 12, 13]) {
      const mk = new cv.Mat(), mk4 = new cv.Mat(); cv.generateImageMarker(dict, id, 120, mk, 1); cv.cvtColor(mk, mk4, cv.COLOR_GRAY2RGBA);
      const M = cv.getPerspectiveTransform(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 120, 0, 120, 120, 0, 120]), cv.matFromArray(4, 1, cv.CV_32FC2, izd(markerKose3B(id)).flat()));
      cv.warpPerspective(mk4, src, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_TRANSPARENT); [mk, mk4, M].forEach((m) => m.delete());
    }
    const d = 15, z0 = -2.5, z1 = 26;
    for (const [a, b] of [[[-d, -d], [d, -d]], [[d, -d], [d, d]], [[d, d], [-d, d]], [[-d, d], [-d, -d]]]) doldur(src, izd([[...a, z0], [...b, z0], [...b, z1], [...a, z1]]), new cv.Scalar(25, 25, 28, 255));
    doldur(src, izd([[-d, d, z1], [d, d, z1], [d, -d, z1], [-d, -d, z1]]), new cv.Scalar(150, 152, 155, 255));
    if (gurultu) { const dd = src.data; for (let i = 0; i < dd.length; i += 4) { const n = (Math.random() + Math.random() + Math.random() - 1.5) * gurultu; for (let c = 0; c < 3; c++) dd[i + c] = Math.max(0, Math.min(255, dd[i + c] + n)); } }
    return src;
  };

  // 1) ArUco poz doğruluğu + küp yeri (ışın-düzlem)
  {
    const r = [Math.PI - 0.12, 0.08, 0.3], t = [4, -3, 222], izd = izdusum(r, t), src = sahne(izd), gri = new cv.Mat();
    cv.cvtColor(src, gri, cv.COLOR_RGBA2GRAY);
    const mk = markerBul(gri), pa = pozBulAruco(mk, W, H);
    kontrol("aruco: 4 marker bulunur", mk.length === 4, mk.map((m) => m.id).join(","));
    const gercek = izd([[0, 0, 0]])[0], ka = yansit(pa, [[0, 0, 0]])[0];
    const hata = Math.hypot(ka.x - gercek[0], ka.y - gercek[1]);
    kontrol("aruco: küp taban izdüşüm hatası < 0.5 px", hata < 0.5, hata.toFixed(3));
    const ust = izd([[2, -3, 15]])[0], yer = kupYeri(pa, { x: ust[0], y: ust[1] });
    kontrol("aruco: küp yeri hatası < 0.3 mm", Math.hypot(yer.x - 2, yer.y + 3) < 0.3, `${yer.x.toFixed(2)},${yer.y.toFixed(2)}`);
    const egim = kareKaydi(pa, "x", []).egim, gercekEgim = Math.acos(Math.abs(rodrigues(r)[8])) * 180 / Math.PI;
    kontrol("eğim hesabı < 1° hata", Math.abs(egim - gercekEgim) < 1, `${egim} vs ${gercekEgim.toFixed(2)}`);
    calistir("teshis = {}; kilit = null; esikDurum = null; kapakTakili = true");
    const kb = kutuBulBolge(src);
    kontrol("markersız: eğik kutu gri kapak olarak bulunur", kb && kb.yontem === "gri kapak", kb && kb.yontem);
    kontrol("köşe inceltme çalışır (geri dönmez)", inceltSayac.ok > 0 && inceltSayac.geri === 0, JSON.stringify(inceltSayac));
    pozSil(pa); src.delete(); gri.delete();
  }

  // 2) gölge reddi
  {
    const bul = (src) => { calistir("teshis = {}; kilit = null; esikDurum = null; kapakTakili = true"); const k = kutuBulBolge(src); src.delete(); return k && k.yontem; };
    const bulanik = (src, k) => cv.GaussianBlur(src, src, new cv.Size(k, k), 0);
    let s = zemin(); doldur(s, [[280, 140], [360, 140], [360, 220], [280, 220]], new cv.Scalar(130, 130, 128, 255)); bulanik(s, 21);
    let y = bul(s); kontrol("gölge: yumuşak gölge gri kapak sayılmaz", y !== "gri kapak", y);
    s = zemin(); doldur(s, [[230, 130], [400, 130], [400, 210], [230, 210]], new cv.Scalar(140, 140, 138, 255)); bulanik(s, 25);
    y = bul(s); kontrol("gölge: telefon gölgesi gri kapak sayılmaz", y !== "gri kapak", y);
    s = zemin(); doldur(s, [[285, 145], [355, 145], [355, 215], [285, 215]], new cv.Scalar(115, 117, 120, 255)); bulanik(s, 3);
    y = bul(s); kontrol("gölge: tepeden kutu (tek ton) bulunur", y === "gri kapak", y);
    s = zemin(); doldur(s, [[350, 150], [420, 170], [420, 250], [350, 240]], new cv.Scalar(150, 150, 148, 255)); bulanik(s, 21);
    doldur(s, [[285, 210], [355, 210], [355, 150], [358, 212], [356, 245], [287, 245]], new cv.Scalar(25, 25, 28, 255));
    doldur(s, [[285, 140], [355, 140], [355, 210], [285, 210]], new cv.Scalar(140, 142, 145, 255)); bulanik(s, 3);
    y = bul(s); kontrol("gölge: yapışık gölgeli kutu bulunur", y === "gri kapak", y);
  }

  // 3) titreme: sabit sahne + gürültü, ham ölçüm σ
  {
    const izd = izdusum([Math.PI - 0.12, 0.08, 0.3], [4, -3, 222]), kareler = [];
    calistir("kilit = null; oncekiPoz = null");
    for (let i = 0; i < 25; i++) {
      const s = sahne(izd, 14), g = new cv.Mat(); cv.cvtColor(s, g, cv.COLOR_RGBA2GRAY);
      const k = {}, m2 = markerBul(g), p2 = pozBulAruco(m2, W, H);
      if (p2) { k.aruco = kareKaydi(p2, p2.ids.join("-"), m2.filter((x) => TABAN.merkez[x.id]).sort((a, b) => a.id - b.id).flatMap((x) => x.kose)); pozSil(p2); }
      calistir("teshis = {}"); const k2 = kutuBulBolge(s);
      if (k2) { const p3 = pozBulMarkersiz(k2.kose, W, H); k.markersiz = kareKaydi(p3, k2.yontem.split(",")[0], k2.kose); pozSil(p3); }
      kareler.push(k); s.delete(); g.delete();
    }
    const a = olcumOzet(kareler, "aruco"), m = olcumOzet(kareler, "markersiz");
    kontrol("titreme: aruco küp σ < 0.1 px, flip 0", a.kupTabanSdPx < 0.1 && a.flip5der === 0, JSON.stringify({ sd: a.kupTabanSdPx, flip: a.flip5der }));
    kontrol("titreme: markersız küp σ < 0.5 px, flip 0", m.kupTabanSdPx < 0.5 && m.flip5der === 0, JSON.stringify({ sd: m.kupTabanSdPx, flip: m.flip5der }));
  }

  // 4) aç/kapa: döngü birikmez (v1.8 hatası: 5 aç/kapada 63 döngü)
  {
    let say = 0; const asil = dongu; globalThis.__dongu = () => { say++; }; calistir("dongu = globalThis.__dongu");
    for (let tur = 0; tur < 5; tur++) {
      const eski = new Map(cagrilar);
      kameraDurdur(); await kameraBaslat();
      for (const [k, fn] of eski) cagrilar.set("eski" + tur + k, fn);   // en kötü durum: tarayıcı eski çağrıyı yine tetikler
    }
    const tetikle = () => { const e = cagrilar; cagrilar = new Map(); for (const fn of e.values()) fn(0, {}); };
    say = 0; tetikle();
    kontrol("aç/kapa: 5 turdan sonra tek döngü", say === 1, String(say));
    kameraDurdur(); say = 0; tetikle();
    kontrol("aç/kapa: kapalıyken döngü yok", say === 0, String(say));
    globalThis.__asil = asil; calistir("dongu = globalThis.__asil");
  }

  // 5) hız bütçesi (bilgisayarda; telefon ~4-6 kat yavaş)
  {
    const izd = izdusum([Math.PI - 0.12, 0.08, 0.3], [4, -3, 222]), src = sahne(izd), gri = new cv.Mat(); cv.cvtColor(src, gri, cv.COLOR_RGBA2GRAY);
    const sure = (fn, n = 20) => { fn(); const t = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - t) / n; };
    const pa = pozBulAruco(markerBul(gri), W, H);
    const ms = { aruco: sure(() => markerBul(gri)), markersiz: sure(() => { calistir("teshis = {}"); kutuBulBolge(src); }), kirmizi: sure(() => kirmiziBulBolge(src, pa)) };
    kontrol("hız: aruco < 15 ms", ms.aruco < 15, ms.aruco.toFixed(2));
    kontrol("hız: markersız < 6 ms", ms.markersiz < 6, ms.markersiz.toFixed(2));
    kontrol("hız: kırmızı (kutu çevresi) < 2 ms", ms.kirmizi < 2, ms.kirmizi.toFixed(2));
    pozSil(pa); src.delete(); gri.delete();
  }

  // 6) arayüz: kodun kullandığı her id sayfada var
  {
    const js = fs.readFileSync(path.join(APP, "app.js"), "utf8"), html = fs.readFileSync(path.join(APP, "index.html"), "utf8");
    const kullanilan = [...new Set([...js.matchAll(/\$\("([A-Za-z0-9]+)"\)/g)].map((m) => m[1]))], var_ = new Set([...html.matchAll(/id="([A-Za-z0-9]+)"/g)].map((m) => m[1]));
    const eksik = kullanilan.filter((x) => !var_.has(x));
    kontrol("arayüz: eksik id yok", eksik.length === 0, eksik.join(","));
    const surum = js.match(/const SURUM = "v([\d.]+)"/)[1];
    kontrol("sürüm: index.html önbellek kırıcı = SURUM", html.includes(`app.js?v=${surum}"`) && html.includes(`kayit.js?v=${surum}"`), surum);
  }
}

const go = async () => {
  try { await testler(); } catch (e) { sonuclar.push({ ad: "BEKLENMEYEN HATA", ok: false, ayrinti: (typeof e === "number" ? cv.exceptionFromPtr(e).msg : e.stack || e) }); }
  for (const s of sonuclar) console.log(`${s.ok ? "GEÇTİ " : "KALDI "} ${s.ad}${s.ayrinti !== undefined ? "  [" + s.ayrinti + "]" : ""}`);
  const kalan = sonuclar.filter((s) => !s.ok).length;
  console.log(kalan ? `\n${kalan} test KALDI — yayın yok` : `\nhepsi geçti (${sonuclar.length})`);
  process.exit(kalan ? 1 : 0);
};
if (cv.getBuildInformation) go(); else cv.onRuntimeInitialized = go;
