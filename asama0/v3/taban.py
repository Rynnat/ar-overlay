"""Aşama 0 v3: taban plakası. Kutu ortadaki yuvaya oturur, 4 kağıt ArUco (id 10-13) köşelerde.
Amaç: kamera kutunun kendi markerlerine değil, plakadaki 4 büyük markere göre poz bulur.
Model sözleşme koordinatında kurulur (plaka üst yüzü z=-0.5), dışa aktarırken tabana indirilir.
"""
import cadquery as cq
from olcu import *


def yap():
    alt_z = PLAKA_ALT_Z
    plaka = (cq.Workplane("XY").box(PLAKA, PLAKA, PLAKA_T)
             .translate((0, 0, alt_z + PLAKA_T / 2))
             .edges().chamfer(PAH))

    # kutu yuvası (taban z=-2.5) + köşe boşaltmaları (nozul köşeyi yuvarlatır, kutunun keskin köşesi otursun)
    yuva_alt = PLAKA_UST_Z - YUVA_DERIN
    plaka = plaka.cut(cq.Workplane("XY").box(YUVA, YUVA, YUVA_DERIN + 1)
                      .translate((0, 0, yuva_alt + (YUVA_DERIN + 1) / 2)))
    h = YUVA / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            plaka = plaka.cut(cq.Workplane("XY").circle(1.0).extrude(YUVA_DERIN + 1)
                              .translate((sx * h, sy * h, yuva_alt)))

    # kağıt yuvaları + cımbız oyuğu (yuvanın dış x kenarında yarım daire) + "+y" oku
    kagit_alt = PLAKA_UST_Z - KAGIT_YUVA_DERIN
    for i, (cx, cy) in MARKER_MERKEZ.items():
        plaka = plaka.cut(cq.Workplane("XY").box(KAGIT_YUVA, KAGIT_YUVA, KAGIT_YUVA_DERIN + 1)
                          .translate((cx, cy, kagit_alt + (KAGIT_YUVA_DERIN + 1) / 2)))
        ox = cx + (1 if cx > 0 else -1) * KAGIT_YUVA / 2
        plaka = plaka.cut(cq.Workplane("XY").circle(3.0).extrude(3)
                          .translate((ox, cy, PLAKA_UST_Z - 1.5)))
        # ok: yuvanın +y kenarının dışında, +y'yi gösteren üçgen + sap (kabartma)
        y0 = cy + KAGIT_YUVA / 2 + 0.6
        ok = (cq.Workplane("XY").workplane(offset=PLAKA_UST_Z)
              .polyline([(cx - 2.2, y0 + 1.2), (cx + 2.2, y0 + 1.2), (cx, y0 + 3.4)]).close()
              .extrude(KABARTMA)
              .union(cq.Workplane("XY").workplane(offset=PLAKA_UST_Z)
                     .center(cx, y0 + 0.6).rect(1.0, 1.4).extrude(KABARTMA)))
        plaka = plaka.union(ok)

    # orta üst şeritte (köşeler kağıtla dolu) "+y" oku ve yazılar
    yazi = (cq.Workplane("XY").workplane(offset=PLAKA_UST_Z).center(0, 46)
            .text("+y", 7, KABARTMA, combine=False, halign="center", valign="center"))
    ok_buyuk = (cq.Workplane("XY").workplane(offset=PLAKA_UST_Z)
                .polyline([(-4, 53), (4, 53), (0, 60)]).close().extrude(KABARTMA))
    v3 = (cq.Workplane("XY").workplane(offset=PLAKA_UST_Z).center(0, -46)
          .text("v3", 7, KABARTMA, combine=False, halign="center", valign="center"))
    plaka = plaka.union(yazi).union(ok_buyuk).union(v3)
    return plaka


if __name__ == "__main__":
    plaka = yap()
    # baskı yönü: alt yüz tablada
    cq.exporters.export(plaka.translate((0, 0, -PLAKA_ALT_Z)), str(OUT / "01_taban_SIYAH.stl"))
    print("01_taban_SIYAH.stl yazıldı")
