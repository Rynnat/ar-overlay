"""Aşama 0 v3 kontrolleri: STL ölçüleri/hacimleri, çakışma ve boşluklar, geometri_v3.json.
Önce taban.py, jig.py, stand.py çalıştırılmış olmalı (STL'leri okur). Çıktı: geometri_v3.json + kontrol_sonuc.txt
"""
import json
import math
import struct
import numpy as np
import cadquery as cq
from olcu import *
import taban
import jig
import stand

satirlar = []


def yaz(s=""):
    print(s)
    satirlar.append(s)


def stl_oku(yol):
    veri = yol.read_bytes()
    n = struct.unpack("<I", veri[80:84])[0]
    a = np.frombuffer(veri[84:84 + n * 50], dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("e", "<u2")]))
    v = a["v"].astype(float)
    hacim = np.einsum("ij,ij->i", v[:, 0], np.cross(v[:, 1], v[:, 2])).sum() / 6
    return v.reshape(-1, 3).min(0), v.reshape(-1, 3).max(0), hacim, n


def hacim(a, b):
    k = a.intersect(b)
    return k.val().Volume() if k.solids().size() else 0.0


def mesafe(a, b):
    return a.val().distance(b.val())


# --- 1) STL ölçüleri ---
yaz("## STL ölçüleri (baskı yönünde)")
yaz("| dosya | X x Y x Z (mm) | hacim (cm3) | ~PLA (g, %100 dolu) | üçgen |")
yaz("|---|---|---|---|---|")
for yol in sorted(OUT.glob("*.stl")):
    mn, mx, h, n = stl_oku(yol)
    b = mx - mn
    assert mn[2] > -1e-3, f"{yol.name} tabla altına iniyor"
    assert b[0] <= 256 and b[1] <= 256 and b[2] <= 256, f"{yol.name} tablaya sığmıyor"
    yaz(f"| {yol.name} | {b[0]:.1f} x {b[1]:.1f} x {b[2]:.1f} | {h / 1000:.2f} | {h / 1000 * 1.24:.1f} | {n} |")

# --- v2 kutu ve küp (v2/kutu.py ölçüleriyle yeniden kuruldu; yan marker cepleri 0.3 mm, burada ihmal) ---
kutu = (cq.Workplane("XY").box(KUTU_DIS, KUTU_DIS, KUTU_TABAN_T + KUTU_DUVAR_Y)
        .translate((0, 0, (KUTU_DUVAR_Y - KUTU_TABAN_T) / 2))
        .cut(cq.Workplane("XY").box(KUTU_IC, KUTU_IC, KUTU_DUVAR_Y + 1).translate((0, 0, (KUTU_DUVAR_Y + 1) / 2))))
kutu_dolu = cq.Workplane("XY").box(KUTU_DIS, KUTU_DIS, KUTU_TABAN_T + KUTU_DUVAR_Y).translate((0, 0, (KUTU_DUVAR_Y - KUTU_TABAN_T) / 2))

# --- 2) plaka ---
yaz()
yaz("## Taban plakası")
plaka = taban.yap()
bb = plaka.val().BoundingBox()
yaz(f"- sınır kutusu (sözleşme koord.): x {bb.xmin:.2f}..{bb.xmax:.2f}, y {bb.ymin:.2f}..{bb.ymax:.2f}, z {bb.zmin:.2f}..{bb.zmax:.2f} (z üstü = kabartmalar {PLAKA_UST_Z}+{KABARTMA})")
c = hacim(plaka, kutu_dolu)
yaz(f"- kutu (dış tabanı z=-2.5) yuvada: çakışma {c:.4f} mm3 (0 olmalı), yan boşluk {YUVA_PAY} mm/yan, yuva tabanı z={PLAKA_UST_Z - YUVA_DERIN:.2f}")
assert c < 1e-6
# kutu 0.1 mm aşağı itilince plakaya değmeli (gerçekten yuva tabanına oturuyor mu)
c2 = hacim(plaka, kutu_dolu.translate((0, 0, -0.1)))
yaz(f"- kutu 0.1 mm aşağı itilince çakışma {c2:.1f} mm3 (>0 -> yuva tabanı tam z=-2.5'te, kutu oturuyor)")
assert c2 > 1
ic_kenar = 42 - KAGIT_YUVA / 2
yaz(f"- kağıt yuvası iç kenarı {ic_kenar:.2f} mm, kutu yuvası kenarı {YUVA / 2:.2f} (+1.0 köşe boşaltması) -> et {ic_kenar - YUVA / 2 - 1.0:.2f} mm (yalnız köşe boşaltma noktasında; düz kenarda {ic_kenar - YUVA / 2:.2f})")
assert ic_kenar > YUVA / 2 + 1.0
dis_kenar = 42 + KAGIT_YUVA / 2
yaz(f"- kağıt yuvası dış kenarı {dis_kenar:.2f}, plaka kenarı {PLAKA / 2:.1f} (pah sonrası üst kenar {PLAKA / 2 - PAH:.1f}) -> et {PLAKA / 2 - PAH - dis_kenar:.2f} mm; cımbız oyuğu r3 -> plaka kenarına {PLAKA / 2 - PAH - dis_kenar - 3:.2f} mm")
yaz(f"- kağıt yuvaları arası (x=0 ekseninde) et: {2 * ic_kenar:.1f} mm")
yaz(f"- marker yüzeyi z = {PLAKA_UST_Z} - {KAGIT_YUVA_DERIN} (cep) + {KAGIT_T} (kağıt) + {YAPISTIRICI_T} (yapıştırıcı) = {MARKER_Z:.2f}")

# --- 3) jig ---
yaz()
yaz("## Jig'ler (kutu içinde, küp ile)")
jigler = jig.yap()
for ad, j in jigler.items():
    cx, cy = jig.KUP_MERKEZ[ad]
    kup = cq.Workplane("XY").box(KUP, KUP, KUP).translate((cx, cy, KUP / 2))
    ck, cq_ = hacim(j, kutu), hacim(j, kup)
    kup_kutu = hacim(kup, kutu)
    m_kutu, m_kup = mesafe(j, kutu), mesafe(j, kup)
    jb = j.val().BoundingBox()
    yaz(f"- {ad}: küp merkezi ({cx:+.1f},{cy:+.1f},{KUP / 2}) | jig-kutu çakışma {ck:.4f}, jig-küp {cq_:.4f}, küp-kutu {kup_kutu:.4f} mm3 | en yakın: kutuya {m_kutu:.2f}, küpe {m_kup:.2f} mm | boy {jb.xlen:.1f}x{jb.ylen:.1f}x{jb.zlen:.1f}, hacim {j.val().Volume() / 1000:.2f} cm3")
    assert ck < 1e-6 and cq_ < 1e-6 and kup_kutu < 1e-6
    # küp ne kadar oynayabilir: ±x ve ±y'de 1 mm'lik adımlarla çakışmaya kadar
    oyun = []
    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
        s = 0.0
        while s < 5 and hacim(j.union(kutu), kup.translate((dx * (s + 0.05), dy * (s + 0.05), 0))) < 1e-6:
            s += 0.05
        oyun.append(s)
    yaz(f"    küpün oyunu (+x,-x,+y,-y) ≈ {', '.join(f'{v:.2f}' for v in oyun)} mm (tasarım: jig yönünde 0.1-0.2, kutu duvarına 0)")

# --- 4) stand ---
yaz()
yaz("## Stand (montaj konumunda)")
p = stand.yap()
sag, sol, tb = p["ayak_sag"], p["ayak_sol"], p["tabla"]
for ad, a, b in [("sağ ayak-tabla", sag, tb), ("sol ayak-tabla", sol, tb), ("sağ ayak-plaka", sag, plaka),
                 ("sol ayak-plaka", sol, plaka), ("tabla-kutu", tb, kutu_dolu)]:
    v = hacim(a, b)
    yaz(f"- {ad} çakışma: {v:.4f} mm3")
    assert v < 1e-6
yaz(f"- ayak dili yarıkta: yan boşluk {stand.DIL_PAY} mm; ayak-plaka en yakın {mesafe(sag, plaka):.1f} mm")
tbb = tb.val().BoundingBox()
yaz(f"- tabla üst yüzü z={stand.TABLA_UST:.1f} -> plaka üst yüzüne {stand.TABLA_UST - PLAKA_UST_Z:.1f} mm; kapak üstüne (z=26) {stand.TABLA_ALT - 26:.1f} mm boşluk")
ab = (sag.union(sol).union(tb)).val().BoundingBox()
yaz(f"- montaj dış ölçüsü: {ab.xlen:.0f} x {ab.ylen:.0f} x {ab.zlen:.0f} mm (masa z={PLAKA_ALT_Z})")
x0, x1, y0, y1 = stand.PENCERE
yaz(f"- kamera penceresi x {x0}..{x1}, y {y0}..{y1} ({x1 - x0:.0f}x{y1 - y0:.0f} mm); telefon kanalı {KANAL} mm, kamera ucu durağı x={stand.DURAK_X}")
# görüş: 26 mm eşdeğer ana kamera (4:3) -> HFOV/VFOV; en kötü lens konumundan 4 markerin dış köşeleri görünüyor mu
hf, vf = 2 * math.atan(17.3 / 26), 2 * math.atan(12.98 / 26)
uzak = 42 + MARKER / 2
h = stand.TABLA_UST - 1.5 - MARKER_Z
en_kotu = 0
for lx in (x0 + 5, x1 - 5):
    for ly in (y0 + 5, y1 - 5):
        ax = max(abs(lx - uzak), abs(lx + uzak))
        ay = max(abs(ly - uzak), abs(ly + uzak))
        # telefon x boyunca yatıyor: görüntünün uzun kenarı x -> HFOV x'te
        en_kotu = max(en_kotu, max(math.degrees(math.atan(ax / h)) / math.degrees(hf / 2), math.degrees(math.atan(ay / h)) / math.degrees(vf / 2)))
yaz(f"- görüş (varsayım 26 mm eşdeğer, HFOV {math.degrees(hf):.0f}°, VFOV {math.degrees(vf):.0f}°, lens markerlerden {h:.0f} mm): pencere köşesindeki en kötü lens konumunda markerlerin FOV doluluğu {en_kotu * 100:.0f}% (<100 = 4 marker görünür)")

# --- 5) geometri_v3.json ---
h2 = MARKER / 2
markerler = []
for i, (cx, cy) in MARKER_MERKEZ.items():
    koseler = [[cx - h2, cy + h2, MARKER_Z], [cx + h2, cy + h2, MARKER_Z], [cx + h2, cy - h2, MARKER_Z], [cx - h2, cy - h2, MARKER_Z]]
    markerler.append({"id": i, "sozluk": "DICT_4X4_50", "kenar": MARKER, "kagit": KAGIT,
                      "merkez": [cx, cy, round(MARKER_Z, 3)], "normal": [0, 0, 1], "ust_yon": [0, 1, 0],
                      "koseler": [[round(v, 3) for v in k] for k in koseler]})
geo = {
    "surum": "asama0 v3",
    "birim": "mm",
    "koordinat": "orijin kutunun yatay merkezi, z=0 kutunun İÇ tabanı, +z yukarı (kameraya doğru), kutunun dış tabanı z=-2.5; +x görüntü sağı, +y görüntü üstü (yukarıdan bakınca)",
    "plaka": {"kenar": PLAKA, "kalinlik": PLAKA_T, "ust_z": PLAKA_UST_Z, "alt_z": PLAKA_ALT_Z,
              "kagit_yuvasi": {"kenar": KAGIT_YUVA, "derinlik": KAGIT_YUVA_DERIN}},
    "marker_z_aciklama": f"plaka üstü {PLAKA_UST_Z} - cep {KAGIT_YUVA_DERIN} + kağıt {KAGIT_T} + yapıştırıcı {YAPISTIRICI_T} = {MARKER_Z:.2f} (±0.1 belirsiz)",
    "kose_sirasi": "ArUco: sol-üst, sağ-üst, sağ-alt, sol-alt (görüntü üstü = +y, sağı = +x) -> (-x,+y), (+x,+y), (+x,-y), (-x,-y)",
    "markerler": markerler,
    "kutu": {"ic_bosluk": KUTU_IC, "dis": KUTU_DIS, "dis_taban_z": -KUTU_TABAN_T, "kapak_ust_z": KUTU_DUVAR_Y + KAPAK_T,
             "yuva_yan_bosluk": YUVA_PAY},
    "kup": {"kenar": KUP},
    "jigler": {ad: {"kup_merkez": [x, y, KUP / 2], "z_aci_derece": 0, "jig_yuksekligi": JIG_H,
                    "belirsizlik_mm": "±0.1 (jig payı) + kutu yuva oyunu ±0.3 (plakaya göre)"}
               for ad, (x, y) in jig.KUP_MERKEZ.items()},
    "stand": {"tabla_ust_z": stand.TABLA_UST, "pencere_xy": list(stand.PENCERE), "telefon_kanali": KANAL,
              "not": "kamera konumu sabit varsayılmaz; poz markerlerden çözülür"},
}
(KLASOR / "geometri_v3.json").write_text(json.dumps(geo, indent=2, ensure_ascii=False), encoding="utf-8")
yaz()
yaz("geometri_v3.json yazıldı")
(KLASOR / "kontrol_sonuc.txt").write_text("\n".join(satirlar), encoding="utf-8")
