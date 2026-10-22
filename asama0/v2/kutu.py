"""Aşama 0 v2: kapaklı kutu + gevşek küp.
Deney: küp köşeye yaslıyken overlay doğru (ideal), çalkalanınca overlay yanılır; hata önceden hesaplanan zarfla kıyaslanır.
Koordinat: kutu iç tabanı z=0, iç boşluğun merkezi (0,0). Overlay yazılımı bu sistemi kullanır.
"""
import json
import math
from pathlib import Path
import cadquery as cq

KLASOR = Path(__file__).parent
OUT = KLASOR / "stl"
OUT.mkdir(exist_ok=True)

# --- parametreler (mm) ---
OLCEK = 0.5               # ana ölçüler; toleranslar (pay, cep derinliği, çentik) ölçeklenmez
IC = 44.0 * OLCEK         # iç boşluk (genişlik = derinlik = yükseklik)
DUVAR = 8.0 * OLCEK       # marker yüzü düz ve sağlam kalsın
TABAN_T = max(5.0 * OLCEK, 2.5)
KAPAK_TAPA = max(3.0 * OLCEK, 2.0)   # kapağın içeri giren kısmı
KAPAK_PAY = 0.3           # tapa her yanda
KAPAK_T = max(3.0 * OLCEK, 2.0)

MARKER = 35.0 * OLCEK     # siyah ArUco karesi
MARKER_KAGIT = 45.0 * OLCEK  # beyaz kenarlı kağıt
CEP_PAY = 0.4
CEP_DERIN = 0.3

KUP = 30.0 * OLCEK
HEDEF_CAP = 1.5           # her yüzün ortasında konik çentik (ölçüm için)
HEDEF_DERIN = 1.0

DIS = IC + 2 * DUVAR
DUVAR_Y = IC + KAPAK_TAPA          # iç tabandan duvar üstüne
DIS_Y = TABAN_T + DUVAR_Y

# --- kutu (iç taban z=0) ---
kutu = (cq.Workplane("XY").box(DIS, DIS, DIS_Y).translate((0, 0, DIS_Y / 2 - TABAN_T))
        .cut(cq.Workplane("XY").box(IC, IC, DUVAR_Y + 1).translate((0, 0, (DUVAR_Y + 1) / 2))))

cep = MARKER_KAGIT + CEP_PAY
zc = DIS_Y / 2 - TABAN_T            # yan yüzün dikey ortası
assert cep < DIS_Y - 2 and cep < DIS - 2, "kağıt yüze sığmıyor"
yuzler = {  # id: (merkez, dışa normal)
    0: ((DIS / 2, 0, zc), (1, 0, 0)),
    1: ((0, DIS / 2, zc), (0, 1, 0)),
    2: ((-DIS / 2, 0, zc), (-1, 0, 0)),
    3: ((0, -DIS / 2, zc), (0, -1, 0)),
}
for (x, y, z), (nx, ny, _) in yuzler.values():
    sx = CEP_DERIN if nx else cep
    sy = CEP_DERIN if ny else cep
    kutu = kutu.cut(cq.Workplane("XY").box(sx, sy, cep)
                    .translate((x - nx * CEP_DERIN / 2, y - ny * CEP_DERIN / 2, z)))

# --- kapak (tapa aşağıda) ---
tapa = IC - 2 * KAPAK_PAY
kapak = (cq.Workplane("XY").box(DIS, DIS, KAPAK_T).translate((0, 0, KAPAK_T / 2))
         .union(cq.Workplane("XY").box(tapa, tapa, KAPAK_TAPA).translate((0, 0, -KAPAK_TAPA / 2))))

# --- küp (alt yüz z=0, merkez 0,0), her yüzde çentik ---
kup = cq.Workplane("XY").box(KUP, KUP, KUP).translate((0, 0, KUP / 2))
h = KUP / 2
for p, d in [((0, 0, KUP), (0, 0, -1)), ((0, 0, 0), (0, 0, 1)),
             ((h, 0, h), (-1, 0, 0)), ((-h, 0, h), (1, 0, 0)),
             ((0, h, h), (0, -1, 0)), ((0, -h, h), (0, 1, 0))]:
    taban_merkez = cq.Vector(*p) + cq.Vector(*d) * HEDEF_DERIN
    koni = cq.Solid.makeCone(0, HEDEF_CAP / 2, HEDEF_DERIN, taban_merkez, cq.Vector(*d) * -1)
    kup = kup.cut(cq.Workplane().add(koni))

# --- kontroller ---
kapali = kutu.intersect(kapak.translate((0, 0, DUVAR_Y)))
cakisma = kapali.val().Volume() if kapali.solids().size() else 0.0
print(f"kapak-kutu çakışma: {cakisma:.3f} mm3 (0 olmalı)")
assert cakisma < 1e-6

# --- hata zarfı (köşe referansından) ---
oteleme = IC - KUP                                   # eksen başına toplam serbest yol
merkez_ref = [-(IC / 2 - KUP / 2), -(IC / 2 - KUP / 2), KUP / 2]
merkez_max = math.hypot(oteleme, oteleme)            # dik dururken karşı köşeye
serbest_donme = KUP * math.sqrt(2) <= IC             # yüz köşegeni sığıyor mu
print(f"eksen başına serbest yol: {oteleme:.1f} mm, merkezin en büyük yatay kayması (dik): {merkez_max:.1f} mm")
print(f"Z etrafında serbest dönebilir mi: {serbest_donme} (yüz köşegeni {KUP*math.sqrt(2):.1f} vs boşluk {IC})")

# --- dışa aktarım (baskı yönü) ---
# slicer'da üst üste açılmasın diye X'te yan yana
ARA = DIS + 10
cq.exporters.export(kutu.translate((0, 0, TABAN_T)), str(OUT / "01_kutu_SIYAH.stl"))
cq.exporters.export(kapak.rotate((0, 0, 0), (1, 0, 0), 180).translate((ARA, 0, KAPAK_T)), str(OUT / "02_kapak_SIYAH.stl"))
cq.exporters.export(kup.translate((-ARA, 0, 0)), str(OUT / f"03_kup_{KUP:g}_KIRMIZI.stl"))

geo = {
    "birim": "mm",
    "koordinat": "kutu iç tabanı z=0, iç boşluk merkezi (0,0); marker 'yukarı' yönü +z",
    "markerler": [{"id": i, "sozluk": "DICT_4X4_50", "kenar": MARKER,
                   "merkez": [round(v, 3) for v in m], "normal": list(n)} for i, (m, n) in yuzler.items()],
    "ic_bosluk": IC,
    "kup": {"kenar": KUP, "referans_poz": {"aciklama": "-x,-y köşesine yaslı, düz",
                                           "merkez": merkez_ref, "z_aci_derece": 0}},
    "zarf": {"eksen_basina_serbest_yol": oteleme, "merkez_max_yatay_kayma_dik": round(merkez_max, 2),
             "z_etrafinda_serbest_donme": serbest_donme},
}
(KLASOR / "geometri.json").write_text(json.dumps(geo, indent=2, ensure_ascii=False), encoding="utf-8")
print("STL + geometri.json yazıldı:", OUT)
