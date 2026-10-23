"""Aşama 0 v3: telefon köprüsü. İki ayak + üst tabla; telefon yüzü yukarı, arka kamerası tabladaki pencereden aşağı bakar.
Tabla üst yüzü plaka üst yüzünden 200 mm yukarıda (lens ~1-2 mm daha aşağıda: kamera çıkıntısı pencereye girer).
Köprü ekseni x; ayaklar plakanın (±70) dışında, iç yüzleri x=±80. Ayak üstündeki dilller tabladaki yarıklara geçer.
Kamera tam (0,0) üstünde olmak zorunda değil: poz plakadaki markerlerden bulunur, yeter ki 4 marker görüntüde olsun.
"""
import cadquery as cq
from olcu import *

MASA_Z = PLAKA_ALT_Z                          # -4.5
TABLA_UST = PLAKA_UST_Z + LENS_YUKSEKLIK      # 199.5
TABLA_T = 6.0
TABLA_ALT = TABLA_UST - TABLA_T
TABLA_GEN = 100.0                             # y
AYAK_IC_X = 80.0                              # plaka kenarı 70 -> 10 mm boşluk
AYAK_T = 5.0                                  # panel kalınlığı (x)
AYAK_GEN = 90.0                               # y
TABLA_BOY = 2 * (AYAK_IC_X + AYAK_T + 6.0)    # 182
DIL_GEN, DIL_Y = 20.0, 25.0                   # dillerin y genişliği, merkezleri ±25
DIL_PAY = 0.2                                 # yarık yan başına (sıkı geçme; gevşekse 1 damla CA)
KABURGA_T = 5.0                               # dış yüzdeki iki payanda (y kenarlarında)
KABURGA_ALT, KABURGA_UST = 40.0, 6.0          # payanda derinliği altta / üstte (x)
RAY_T, RAY_H = 4.0, 5.0                       # telefon kanalı rayları
DURAK_X = 40.0                                # telefonun kamera ucu buraya dayanır
PENCERE = (-12.0, 38.0, -36.0, 36.0)          # x0, x1, y0, y1


def ayak_sag():
    """+x ayağı, montaj koordinatında. Sol ayak bunun z ekseni etrafında 180° döndürülmüşü (aynı parça)."""
    x0, x1 = AYAK_IC_X, AYAK_IC_X + AYAK_T
    h = TABLA_ALT - MASA_Z
    panel = cq.Workplane("XY").box(AYAK_T, AYAK_GEN, h).translate(((x0 + x1) / 2, 0, MASA_Z + h / 2))
    # hafifletme penceresi (yan şeritler 15 mm kalır)
    panel = panel.cut(cq.Workplane("XY").box(AYAK_T + 2, AYAK_GEN - 30, h - 40)
                      .translate(((x0 + x1) / 2, 0, MASA_Z + 15 + (h - 40) / 2)))
    for sy in (-1, 1):
        dil = cq.Workplane("XY").box(AYAK_T, DIL_GEN, TABLA_T).translate(((x0 + x1) / 2, sy * DIL_Y, TABLA_ALT + TABLA_T / 2))
        panel = panel.union(dil)
        # payanda: XZ düzleminde yamuk, y kenarında
        yc = sy * (AYAK_GEN / 2 - KABURGA_T / 2)
        kab = (cq.Workplane("XZ", origin=(0, yc + KABURGA_T / 2, 0))
               .polyline([(x1, MASA_Z), (x1 + KABURGA_ALT, MASA_Z), (x1 + KABURGA_UST, TABLA_ALT), (x1, TABLA_ALT)])
               .close().extrude(KABURGA_T))
        panel = panel.union(kab)
    return panel


def tabla():
    x0, x1, y0, y1 = PENCERE
    t = cq.Workplane("XY").box(TABLA_BOY, TABLA_GEN, TABLA_T).translate((0, 0, TABLA_ALT + TABLA_T / 2))
    t = t.edges("|Z").fillet(4)
    t = t.cut(cq.Workplane("XY").box(x1 - x0, y1 - y0, TABLA_T + 2).translate(((x0 + x1) / 2, (y0 + y1) / 2, TABLA_ALT + TABLA_T / 2)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            t = t.cut(cq.Workplane("XY").box(AYAK_T + 2 * DIL_PAY, DIL_GEN + 2 * DIL_PAY, TABLA_T + 2)
                      .translate((sx * (AYAK_IC_X + AYAK_T / 2), sy * DIL_Y, TABLA_ALT + TABLA_T / 2)))
    # raylar (kanal genişliği KANAL) + kamera ucu durağı
    for sy in (-1, 1):
        t = t.union(cq.Workplane("XY").box(TABLA_BOY - 8, RAY_T, RAY_H)
                    .translate((0, sy * (KANAL / 2 + RAY_T / 2), TABLA_UST + RAY_H / 2)))
    t = t.union(cq.Workplane("XY").box(RAY_T, KANAL, RAY_H).translate((DURAK_X + RAY_T / 2, 0, TABLA_UST + RAY_H / 2)))
    # yazı: kamera ucu buraya
    t = t.union(cq.Workplane("XY").workplane(offset=TABLA_UST).center(60, 0)
                .text("KAMERA >", 5, KABARTMA, combine=False, halign="center", valign="center"))
    return t


def yap():
    sag = ayak_sag()
    return {"ayak_sag": sag, "ayak_sol": sag.rotate((0, 0, 0), (0, 0, 1), 180), "tabla": tabla()}


def tablaya_yatir(govde):
    bb = govde.val().BoundingBox()
    return govde.translate((-bb.xmin, -bb.ymin, -bb.zmin))


if __name__ == "__main__":
    p = yap()
    # ayak: iç yüzü (x=80) tablada, payandalar yukarı; Y ekseni etrafında -90°: x -> z
    ayak = tablaya_yatir(p["ayak_sag"].translate((-AYAK_IC_X, 0, 0)).rotate((0, 0, 0), (0, 1, 0), -90))
    iki = ayak.union(ayak.translate((0, AYAK_GEN + 10, 0)))
    cq.exporters.export(iki, str(OUT / "05_stand_ayak_x2.stl"))
    cq.exporters.export(tablaya_yatir(p["tabla"]), str(OUT / "06_stand_tabla.stl"))
    print("stand STL'leri yazıldı")
