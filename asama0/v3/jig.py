"""Aşama 0 v3: küpü kutu içinde bilinen konuma koyan ara parçalar (jig).
Kutu iç boşluğu 22, küp 15 -> eksen başına serbest yol ±3.5 mm. Jig kutu tabanına (z=0) oturur, küp de tabanda.
J0: küp ortada (0,0). J1: küp +x,+y köşesine yaslı (+3.5,+3.5). J2: küp yalnız x'te +3.5, y ortada (3.5,0).
"""
import cadquery as cq
from olcu import *

DIS_YARI = KUTU_IC / 2 - JIG_PAY_KUTU     # 10.9: jig dış kenarı
KUP_YARI = KUP / 2 + JIG_PAY_KUP          # 7.6: küp boşluğu yarı genişliği
KOSE_PAH = 0.8                            # kutunun basılı iç köşesi yuvarlak -> jig dış köşesi pahlı
RAHATLAMA = 0.8                           # jig iç köşesinde boşaltma (küpün keskin köşesi otursun)

# her jig için küp merkezi (sözleşme koordinatı)
KUP_MERKEZ = {"J0": (0.0, 0.0), "J1": (SERBEST, SERBEST), "J2": (SERBEST, 0.0)}


def kutu_xy(x0, x1, y0, y1):
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, JIG_H).translate(((x0 + x1) / 2, (y0 + y1) / 2, JIG_H / 2))


def bosalt(govde, noktalar):
    for x, y in noktalar:
        govde = govde.cut(cq.Workplane("XY").circle(RAHATLAMA).extrude(JIG_H + 2).translate((x, y, -1)))
    return govde


def isim(govde, yazi, x, y, boy):
    return govde.union(cq.Workplane("XY").workplane(offset=JIG_H).center(x, y)
                       .text(yazi, boy, KABARTMA, combine=False, halign="center", valign="center"))


def yap():
    D = DIS_YARI
    dis = cq.Workplane("XY").box(2 * D, 2 * D, JIG_H).translate((0, 0, JIG_H / 2)).edges("|Z").chamfer(KOSE_PAH)
    jigler = {}

    # J0: dört duvarlı çerçeve
    cx, cy = KUP_MERKEZ["J0"]
    k = KUP_YARI
    j0 = dis.cut(kutu_xy(cx - k, cx + k, cy - k, cy + k).translate((0, 0, -1)).union(
        kutu_xy(cx - k, cx + k, cy - k, cy + k).translate((0, 0, 1))))
    j0 = bosalt(j0, [(cx + sx * k, cy + sy * k) for sx in (-1, 1) for sy in (-1, 1)])
    jigler["J0"] = isim(j0, "J0", 0, -(k + D) / 2, 2.4)

    # J1: L parça, küp -x ve -y tarafındaki 7 mm'yi doldurur
    cx, cy = KUP_MERKEZ["J1"]
    j1 = dis.intersect(kutu_xy(-D, cx - k, -D, D).union(kutu_xy(-D, D, -D, cy - k)))
    j1 = bosalt(j1, [(cx - k, cy - k)])
    jigler["J1"] = isim(j1, "J1", (-D + cx - k) / 2, (-D + cy - k) / 2, 4)

    # J2: -x dolgu + küpü y'de ortalayan iki ray (U)
    cx, cy = KUP_MERKEZ["J2"]
    j2 = dis.intersect(kutu_xy(-D, cx - k, -D, D)
                       .union(kutu_xy(-D, D, cy + k, D)).union(kutu_xy(-D, D, -D, cy - k)))
    j2 = bosalt(j2, [(cx - k, cy - k), (cx - k, cy + k)])
    jigler["J2"] = isim(j2, "J2", (-D + cx - k) / 2, 0, 4)
    return jigler


if __name__ == "__main__":
    jigler = yap()
    for n, (ad, j) in enumerate(jigler.items()):
        # baskı yönü: alt yüz tablada, yazı yukarıda; slicer'da üst üste açılmasın diye X'te yan yana
        cq.exporters.export(j.translate((n * 30, 0, 0)), str(OUT / f"0{n + 2}_jig_{ad}.stl"))
    print("jig STL'leri yazıldı")
