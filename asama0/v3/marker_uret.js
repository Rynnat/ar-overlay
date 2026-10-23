// Aşama 0 v3: taban plakası işaretçileri (DICT_4X4_50, id 10-13) -> vektör SVG + yazdırma HTML'i.
// Bit desenleri uygulamanın kullandığı opencv.js'ten gelir (aynı sözlük, aynı sürüm).
// Çalıştır: node marker_uret.js
const fs = require('fs');
const path = require('path');
global.cv = require('C:/Users/LENOVO/Projeler/ar-cerrahi/app/vendor/opencv.js');

const KLASOR = __dirname;
const IDLER = [10, 11, 12, 13];
const MARKER = 35;          // siyah kare kenarı (mm)
const KAGIT = 45;           // kesim karesi (mm) = marker + 2 x 5 mm sessiz bölge
const HUCRE_SAYISI = 6;     // 4x4 veri + 1 hücre siyah kenar her yanda
const HUCRE = MARKER / HUCRE_SAYISI;
const SESSIZ = (KAGIT - MARKER) / 2;

function matrisUret() {
  const sozluk = cv.getPredefinedDictionary(cv.DICT_4X4_50);
  const matrisler = {};
  for (const id of IDLER) {
    const m = new cv.Mat();
    cv.generateImageMarker(sozluk, id, HUCRE_SAYISI, m, 1);
    if (m.rows !== 6 || m.cols !== 6) throw new Error(`id ${id}: ${m.rows}x${m.cols}`);
    const satirlar = [];
    for (let r = 0; r < 6; r++) {
      const satir = [];
      for (let c = 0; c < 6; c++) satir.push(m.ucharAt(r, c) > 127 ? 1 : 0); // 1 = beyaz
      satirlar.push(satir);
    }
    m.delete();
    matrisler[id] = satirlar;
  }
  return matrisler;
}

function dogrula(matrisler) {
  // dış halka tamamen siyah mı + iç 4x4 boş/tam dolu değil mi; matrisi yazdır
  const imzalar = new Set();
  for (const id of IDLER) {
    const m = matrisler[id];
    for (let i = 0; i < 6; i++) {
      if (m[0][i] || m[5][i] || m[i][0] || m[i][5]) throw new Error(`id ${id}: dış halka siyah değil`);
    }
    const ic = m.slice(1, 5).map(s => s.slice(1, 5).join('')).join('|');
    if (imzalar.has(ic)) throw new Error(`id ${id}: başka id ile aynı desen`);
    imzalar.add(ic);
    console.log(`id ${id} (1=beyaz, satır 0 = görüntü üstü = +y):`);
    for (const s of m) console.log('   ' + s.map(b => (b ? '□' : '■')).join(' '));
  }
  console.log('kontrol: 4 markerin dış halkası siyah, iç desenler birbirinden farklı');
}

// --- SVG çizimi (birim mm) ---
function markerSvg(id, m, x0, y0, takim) {
  // x0,y0 = 45 mm kesim karesinin sol üstü
  const p = [];
  p.push(`<g id="m${id}${takim}">`);
  p.push(`<rect x="${x0}" y="${y0}" width="${KAGIT}" height="${KAGIT}" fill="#fff" stroke="#9a9a9a" stroke-width="0.1"/>`);
  const mx = x0 + SESSIZ, my = y0 + SESSIZ;
  // siyah zemin + beyaz hücreler (siyah hücreler arasında ince çizgi kalmasın diye)
  p.push(`<rect x="${mx}" y="${my}" width="${MARKER}" height="${MARKER}" fill="#000"/>`);
  let d = '';
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    if (m[r][c]) {
      const x = +(mx + c * HUCRE).toFixed(4), y = +(my + r * HUCRE).toFixed(4);
      d += `M${x} ${y}h${HUCRE.toFixed(4)}v${HUCRE.toFixed(4)}h-${HUCRE.toFixed(4)}z`;
    }
  }
  if (d) p.push(`<path d="${d}" fill="#fff" shape-rendering="crispEdges"/>`);
  // sessiz bölgenin dış 2 mm'sinde açık gri küçük etiket (kesince yön/id kaybolmasın; marker kenarına >=3 mm)
  p.push(`<text x="${x0 + KAGIT / 2}" y="${y0 + 1.7}" font-family="Arial, Helvetica, sans-serif" font-size="1.6" fill="#c8c8c8" text-anchor="middle">↑ +y  id${id}</text>`);
  // kesim karesinin altında: id ve ok
  const ay = y0 + KAGIT + 6;
  p.push(`<text x="${x0 + 2}" y="${ay}" font-family="Arial, Helvetica, sans-serif" font-size="4.2" fill="#000">id ${id}${takim ? ' (yedek)' : ''}</text>`);
  const ox = x0 + KAGIT - 9;
  p.push(`<path d="M${ox} ${ay + 0.5}v-5.5m-2 2l2-2.6l2 2.6" fill="none" stroke="#000" stroke-width="0.45"/>`);
  p.push(`<text x="${ox + 2.5}" y="${ay}" font-family="Arial, Helvetica, sans-serif" font-size="4.2" fill="#000">+y</text>`);
  p.push('</g>');
  return p.join('\n');
}

function sayfaSvg(matrisler) {
  // plakadaki yerleşimi taklit et: üst sıra id10 (-x,+y), id11 (+x,+y); alt sıra id13 (-x,-y), id12 (+x,-y)
  const yer = [[10, 0, 0], [11, 1, 0], [13, 0, 1], [12, 1, 1]];
  const ARA_X = 20, SATIR = KAGIT + 12;
  const x0 = (210 - (2 * KAGIT + ARA_X)) / 2;
  const p = [];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">`);
  p.push(`<rect width="210" height="297" fill="#fff"/>`);
  p.push(`<text x="105" y="12" font-family="Arial, Helvetica, sans-serif" font-size="4.5" text-anchor="middle" font-weight="bold">AR cerrahi - Aşama 0 v3 taban işaretçileri (DICT_4X4_50, 35 mm, kâğıt 45 mm)</text>`);
  p.push(`<text x="105" y="18" font-family="Arial, Helvetica, sans-serif" font-size="3.2" text-anchor="middle">Baskıda %100 / gerçek boyut, ölçeklendirme KAPALI. Aşağıdaki cetvel 100 mm değilse KULLANMA. Gri çizgiden kes; ok (+y) plakadaki oka baksın.</text>`);
  for (const [takim, ust] of [['', 24], ['b', 24 + 2 * SATIR + 6]]) {
    if (takim) p.push(`<line x1="10" y1="${ust - 4}" x2="200" y2="${ust - 4}" stroke="#ddd" stroke-width="0.2" stroke-dasharray="2 2"/>`);
    for (const [id, cx, cy] of yer) p.push(markerSvg(id, matrisler[id], x0 + cx * (KAGIT + ARA_X), ust + cy * SATIR, takim));
  }
  // 100 mm cetvel
  const cy0 = 274, cx0 = 55;
  p.push(`<g id="cetvel">`);
  p.push(`<rect x="${cx0}" y="${cy0}" width="100" height="3" fill="#000"/>`);
  for (let i = 0; i <= 100; i += 10) {
    p.push(`<line x1="${cx0 + i}" y1="${cy0 - (i % 50 ? 2 : 4)}" x2="${cx0 + i}" y2="${cy0}" stroke="#000" stroke-width="0.25"/>`);
  }
  p.push(`<text x="${cx0}" y="${cy0 - 5}" font-family="Arial, Helvetica, sans-serif" font-size="3">0</text>`);
  p.push(`<text x="${cx0 + 100}" y="${cy0 - 5}" font-family="Arial, Helvetica, sans-serif" font-size="3" text-anchor="end">100 mm</text>`);
  p.push(`<text x="105" y="${cy0 + 8}" font-family="Arial, Helvetica, sans-serif" font-size="3" text-anchor="middle">Cetvel 100 mm olmalı (±0.5). Ayrıca marker siyah karesi 35.0 mm, kesim karesi 45.0 mm olmalı.</text>`);
  p.push(`</g>`);
  p.push(`</svg>`);
  return p.join('\n');
}

function calis() {
  const matrisler = matrisUret();
  dogrula(matrisler);
  const svg = sayfaSvg(matrisler);
  fs.writeFileSync(path.join(KLASOR, 'marker_sayfasi.svg'), svg, 'utf8');
  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>Aşama 0 v3 işaretçi sayfası</title>
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
svg { display: block; width: 210mm; height: 297mm; }
@media screen { body { background: #888; } svg { margin: 10px auto; background: #fff; } }
</style></head><body>
${svg}
</body></html>
`;
  fs.writeFileSync(path.join(KLASOR, 'marker_sayfasi.html'), html, 'utf8');
  fs.writeFileSync(path.join(KLASOR, 'marker_bitleri.json'),
    JSON.stringify({ sozluk: 'DICT_4X4_50', aciklama: '6x6, 1=beyaz, satır 0 = görüntü üstü (+y), sütun 0 = görüntü solu (-x)', matrisler }, null, 1), 'utf8');
  console.log('yazıldı: marker_sayfasi.svg, marker_sayfasi.html, marker_bitleri.json');
}

if (cv.getBuildInformation) calis(); else cv.onRuntimeInitialized = calis;
