// Otomatik kayıt: ölçümler ve kare kayıtları gizli GitHub reposuna (Rynnat/ar-overlay-kayit) yazılır.
// Anahtar (yalnız o repoya Contents yazma izni olan ince ayarlı GitHub token) yalnız bu telefonun
// localStorage'ında durur; kodda ve yayında yoktur. Yüklemeler sırayla gider (aynı dala eşzamanlı
// PUT 409 verir). Anahtar yoksa hiçbir şey gönderilmez, uygulama yine çalışır.

const KAYIT_REPO = "Rynnat/ar-overlay-kayit";
const KAYIT = {
  kareAralikMs: 200,     // normalde kare kaydı ~5 Hz
  gonderAralikMs: 15000, // bu kadar sürede bir tampon dosya olarak gönderilir
  tamponSiniri: 1500,    // tampon bundan büyürse beklemeden gönder
};

const kayitDurum = { anahtar: null, oturum: null, sira: 0, gonderilen: 0, hata: "", kuyruk: Promise.resolve(), bekleyen: 0 };
let kareTampon = [], sonKareLog = 0, sonGonderim = 0, oturumBas = 0;

function anahtarYukle() {
  // ayar ekranı yok: anahtar bir kez adresle gelir (#anahtar=...), kaydedilir ve adresten silinir
  const m = location.hash.match(/anahtar=([^&]+)/);
  if (m) { try { localStorage.setItem("ghToken", decodeURIComponent(m[1])); } catch (e) { /* özel pencere */ } history.replaceState(null, "", location.pathname + location.search); }
  try { kayitDurum.anahtar = localStorage.getItem("ghToken") || (m && decodeURIComponent(m[1])) || null; } catch (e) { kayitDurum.anahtar = m ? decodeURIComponent(m[1]) : null; }
  if (kayitDurum.anahtar) anahtarDene();
  kayitYazDurum();
}
function anahtarKaydet(t) {
  t = (t || "").trim();
  try { if (t) localStorage.setItem("ghToken", t); else localStorage.removeItem("ghToken"); } catch (e) { /* özel pencere: yalnız oturum */ }
  kayitDurum.anahtar = t || null; kayitDurum.hata = "";
  kayitYazDurum();
  if (t) anahtarDene();
}
async function anahtarDene() {
  // repoya erişim var mı (yazma izni ilk yüklemede belli olur)
  try {
    const y = await fetch(`https://api.github.com/repos/${KAYIT_REPO}`, { headers: ghBaslik() });
    kayitDurum.hata = y.ok ? "" : y.status === 401 ? "anahtar geçersiz" : y.status === 404 ? "anahtar bu repoyu göremiyor" : "GitHub " + y.status;
  } catch (e) { kayitDurum.hata = "ağ yok"; }
  kayitYazDurum();
}
const ghBaslik = () => ({ Authorization: "Bearer " + kayitDurum.anahtar, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });

function kayitYazDurum() {
  const el = document.getElementById("kayitDurum");
  if (!el) return;
  if (!kayitDurum.anahtar) { el.textContent = "logger: anahtar yok (kayıt gönderilmiyor)"; return; }
  el.textContent = `logger: ${kayitDurum.hata ? "SORUN: " + kayitDurum.hata : "bağlı"} · oturum ${kayitDurum.oturum || "-"} · gönderilen ${kayitDurum.gonderilen} dosya` +
    (kayitDurum.bekleyen ? ` · kuyrukta ${kayitDurum.bekleyen}` : "") + (kareTampon.length ? ` · tampon ${kareTampon.length} kare` : "");
}

// metin -> base64 (UTF-8 güvenli), blob -> base64
const b64Metin = (s) => { const b = new TextEncoder().encode(s); let x = ""; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); };
const b64Blob = (blob) => new Promise((ok, red) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = red; r.readAsDataURL(blob); });

function dosyaYukle(ad, icerikB64) {
  // sıraya koy: kayit/<gün>/<oturum>/<sıra>-<ad>
  if (!kayitDurum.anahtar || !kayitDurum.oturum) return Promise.resolve(false);
  const yol = `kayit/${kayitDurum.oturum.slice(0, 10)}/${kayitDurum.oturum}/${String(kayitDurum.sira++).padStart(4, "0")}-${ad}`;
  kayitDurum.bekleyen++; kayitYazDurum();
  const is = kayitDurum.kuyruk.then(async () => {
    for (let deneme = 0; deneme < 3; deneme++) {
      try {
        const y = await fetch(`https://api.github.com/repos/${KAYIT_REPO}/contents/${encodeURI(yol)}`, {
          method: "PUT", headers: { ...ghBaslik(), "Content-Type": "application/json" }, keepalive: icerikB64.length < 60000,
          body: JSON.stringify({ message: `kayıt ${yol}`, content: icerikB64 }),
        });
        if (y.ok) { kayitDurum.gonderilen++; kayitDurum.hata = ""; return true; }
        if (y.status === 401 || y.status === 403 || y.status === 404) { kayitDurum.hata = `GitHub ${y.status} (anahtar/izin)`; return false; }
        kayitDurum.hata = "GitHub " + y.status;
      } catch (e) { kayitDurum.hata = "ağ: " + e.message; }
      await new Promise((ok) => setTimeout(ok, 1500 * (deneme + 1)));
    }
    return false;
  }).finally(() => { kayitDurum.bekleyen--; kayitYazDurum(); });
  kayitDurum.kuyruk = is.catch(() => false);
  return is;
}
const jsonYukle = (ad, nesne) => dosyaYukle(ad + ".json", b64Metin(JSON.stringify(nesne)));
async function blobYukle(ad, blob) { return dosyaYukle(ad, await b64Blob(blob)); }

function oturumBaslat(bilgi) {
  const s = new Date(), iki = (n) => String(n).padStart(2, "0");
  kayitDurum.oturum = `${s.getFullYear()}-${iki(s.getMonth() + 1)}-${iki(s.getDate())}_${iki(s.getHours())}${iki(s.getMinutes())}${iki(s.getSeconds())}`;
  kayitDurum.sira = 0; kareTampon = []; oturumBas = performance.now(); sonGonderim = oturumBas;
  jsonYukle("oturum", { ...bilgi, tarayici: navigator.userAgent, zaman: s.toISOString(), ekran: [screen.width, screen.height, devicePixelRatio] });
}

// her işlenen karede çağrılır; kendisi seyreltir (ölçüm sırasında her kare)
function kareLog(kayit, hepsi) {
  if (!kayitDurum.anahtar || !kayitDurum.oturum) return;
  const simdi = performance.now();
  if (!hepsi && simdi - sonKareLog < KAYIT.kareAralikMs) return;
  sonKareLog = simdi;
  kareTampon.push({ t: Math.round(simdi - oturumBas), ...kayit });
  if (kareTampon.length >= KAYIT.tamponSiniri || simdi - sonGonderim > KAYIT.gonderAralikMs) tamponGonder();
}
function tamponGonder() {
  sonGonderim = performance.now();
  if (!kareTampon.length) return;
  const parca = kareTampon; kareTampon = [];
  jsonYukle("kareler", { surum: typeof SURUM !== "undefined" ? SURUM : "?", kare: parca.length, kareler: parca });
}
function olayLog(tip, veri) {
  if (!kayitDurum.anahtar || !kayitDurum.oturum) return;
  jsonYukle("olay-" + tip, { t: Math.round(performance.now() - oturumBas), tip, ...veri });
}

// sayfa kapanırken / arka plana giderken tamponu gönder; hataları kaydet
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") tamponGonder(); });
window.addEventListener("error", (e) => olayLog("hata", { mesaj: String(e.message), kaynak: e.filename, satir: e.lineno }));
window.addEventListener("unhandledrejection", (e) => olayLog("hata", { mesaj: String(e.reason && (e.reason.message || e.reason)) }));
setInterval(kayitYazDurum, 2000);
