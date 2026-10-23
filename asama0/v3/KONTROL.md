# Aşama 0 v3 — KONTROL

Üretim: `node marker_uret.js` → `python taban.py` → `python jig.py` → `python stand.py` → `python kontrol.py`
(Python: epic-project/.venv-cad). Aşağıdaki sayılar `kontrol.py` çıktısıdır (kontrol_sonuc.txt ile aynı).
Kutu ve küp, v2/kutu.py ölçüleriyle yeniden kuruldu (v2 STL içe aktarılmadı; v2 kutunun yan yüzlerindeki 0.3 mm marker cepleri ihmal edildi — dış ölçüyü değiştirmez).

## STL ölçüleri (baskı yönünde)
| dosya | X x Y x Z (mm) | hacim (cm3) | ~PLA (g, %100 dolu) | üçgen |
|---|---|---|---|---|
| 01_taban_SIYAH.stl | 140.0 x 140.0 x 4.4 | 74.17 | 92.0 | 6310 |
| 02_jig_J0.stl | 21.8 x 21.8 x 5.4 | 1.19 | 1.5 | 4244 |
| 03_jig_J1.stl | 21.8 x 21.8 x 5.4 | 1.24 | 1.5 | 1414 |
| 04_jig_J2.stl | 21.8 x 21.8 x 5.4 | 1.22 | 1.5 | 2928 |
| 05_stand_ayak_x2.stl | 204.0 x 190.0 x 45.0 | 176.88 | 219.3 | 160 |
| 06_stand_tabla.stl | 182.0 x 100.0 x 11.0 | 93.45 | 115.9 | 2026 |

## Taban plakası
- sınır kutusu (sözleşme koord.): x -70.00..70.00, y -70.00..70.00, z -4.50..-0.10 (z üstü = kabartmalar -0.5+0.4)
- kutu (dış tabanı z=-2.5) yuvada: çakışma 0.0000 mm3 (0 olmalı), yan boşluk 0.3 mm/yan, yuva tabanı z=-2.50
- kutu 0.1 mm aşağı itilince çakışma 90.0 mm3 (>0 -> yuva tabanı tam z=-2.5'te, kutu oturuyor)
- kağıt yuvası iç kenarı 19.30 mm, kutu yuvası kenarı 15.30 (+1.0 köşe boşaltması) -> et 3.00 mm (yalnız köşe boşaltma noktasında; düz kenarda 4.00)
- kağıt yuvası dış kenarı 64.70, plaka kenarı 70.0 (pah sonrası üst kenar 69.0) -> et 4.30 mm; cımbız oyuğu r3 -> plaka kenarına 1.30 mm
- kağıt yuvaları arası (x=0 ekseninde) et: 38.6 mm
- marker yüzeyi z = -0.5 - 0.2 (cep) + 0.1 (kağıt) + 0.05 (yapıştırıcı) = -0.55

## Jig'ler (kutu içinde, küp ile)
- J0: küp merkezi (+0.0,+0.0,7.5) | jig-kutu çakışma 0.0000, jig-küp 0.0000, küp-kutu 0.0000 mm3 | en yakın: kutuya 0.00, küpe 0.10 mm | boy 21.8x21.8x5.4, hacim 1.18 cm3
    küpün oyunu (+x,-x,+y,-y) ≈ 0.10, 0.10, 0.10, 0.10 mm (tasarım: jig yönünde 0.1-0.2, kutu duvarına 0)
- J1: küp merkezi (+3.5,+3.5,7.5) | jig-kutu çakışma 0.0000, jig-küp 0.0000, küp-kutu 0.0000 mm3 | en yakın: kutuya 0.00, küpe 0.10 mm | boy 21.8x21.8x5.4, hacim 1.24 cm3
    küpün oyunu (+x,-x,+y,-y) ≈ 0.00, 0.10, 0.00, 0.10 mm (tasarım: jig yönünde 0.1-0.2, kutu duvarına 0)
- J2: küp merkezi (+3.5,+0.0,7.5) | jig-kutu çakışma 0.0000, jig-küp 0.0000, küp-kutu 0.0000 mm3 | en yakın: kutuya 0.00, küpe 0.10 mm | boy 21.8x21.8x5.4, hacim 1.22 cm3
    küpün oyunu (+x,-x,+y,-y) ≈ 0.00, 0.10, 0.10, 0.10 mm (tasarım: jig yönünde 0.1-0.2, kutu duvarına 0)

## Stand (montaj konumunda)
- sağ ayak-tabla çakışma: 0.0000 mm3
- sol ayak-tabla çakışma: 0.0000 mm3
- sağ ayak-plaka çakışma: 0.0000 mm3
- sol ayak-plaka çakışma: 0.0000 mm3
- tabla-kutu çakışma: 0.0000 mm3
- ayak dili yarıkta: yan boşluk 0.2 mm; ayak-plaka en yakın 10.0 mm
- tabla üst yüzü z=199.5 -> plaka üst yüzüne 200.0 mm; kapak üstüne (z=26) 167.5 mm boşluk
- montaj dış ölçüsü: 250 x 100 x 209 mm (masa z=-4.5)
- kamera penceresi x -12.0..38.0, y -36.0..36.0 (50x72 mm); telefon kanalı 80.0 mm, kamera ucu durağı x=40.0
- görüş (varsayım 26 mm eşdeğer, HFOV 67°, VFOV 53°, lens markerlerden 199 mm): pencere köşesindeki en kötü lens konumunda markerlerin FOV doluluğu 92% (<100 = 4 marker görünür)

geometri_v3.json yazıldı

## Marker bitleri (opencv.js `generateImageMarker`, 6x6, ■ siyah □ beyaz, satır 0 = +y)
Dış halka 4 markerde de tamamen siyah, iç desenler farklı. Ek doğrulama: matristen sentetik görüntü çizilip opencv.js
`ArucoDetector` ile okundu → id 10/11/12/13 doğru, köşe sırası sol-üst, sağ-üst, sağ-alt, sol-alt (görüntü üstü = +y). Matrisler: marker_bitleri.json.

```
id 10            id 11            id 12            id 13
■ ■ ■ ■ ■ ■      ■ ■ ■ ■ ■ ■      ■ ■ ■ ■ ■ ■      ■ ■ ■ ■ ■ ■
■ □ □ □ □ ■      ■ ■ ■ ■ □ ■      ■ ■ ■ ■ ■ ■      ■ ■ ■ □ ■ ■
■ □ ■ ■ □ ■      ■ ■ ■ ■ □ ■      ■ □ □ □ ■ ■      ■ □ ■ □ ■ ■
■ □ ■ ■ □ ■      ■ □ ■ □ ■ ■      ■ □ ■ □ □ ■      ■ ■ ■ ■ ■ ■
■ ■ ■ ■ □ ■      ■ ■ □ □ □ ■      ■ ■ □ □ □ ■      ■ □ □ □ □ ■
■ ■ ■ ■ ■ ■      ■ ■ ■ ■ ■ ■      ■ ■ ■ ■ ■ ■      ■ ■ ■ ■ ■ ■
```

## İstekten sapmalar (bilinçli)
- **Plaka 130 → 140 mm.** Kağıt yuvası (45.4) merkezi ±42 → dış kenar 64.7; 130 mm plakada kenara 0.3 mm et kalıyor, 1 mm pah onu yiyordu. Marker konumları (sözleşme) değişmedi.
- **Kağıt yuvası 45.4** (yan başına 0.2 pay), elle kesilen 45 mm kağıt girsin. Marker konum belirsizliği ±0.2 mm.
- **Marker z = -0.55** (önerilen -0.4 değil): kağıt 0.2 mm cebin içinde. -0.5 − 0.2 + 0.1 kağıt + 0.05 yapıştırıcı. Fark 200 mm'den bakınca ihmal edilebilir.
- **"+y"/"v3" yazısı köşede değil**, üst/alt orta şeritte (köşeler kağıt yuvasıyla dolu): "+y" + büyük ok (0,+46..+60), "v3" (0,-46). Her kağıt yuvasının +y kenarının dışında ayrıca küçük ok var (alt sıradakiler iç tarafta, kutu yuvasıyla arada 4 mm şerit).
- **Cımbız oyuğu**: yuvanın dış x kenarının ortasında r=3, 1.5 mm derin yarım daire (kağıdın sessiz bölgesinin altına 3 mm girer, marker siyahına değmez).
- **Jig ölçüleri**: dış 21.8, küp boşluğu 15.2 (yan başına 0.1, istekteki toplam −0.2/+0.2). Duvar 3.3 mm (3.5 değil, payların sonucu). İç köşelerde r0.8 boşaltma, dış dikey köşelerde 0.8 pah (basılı kutu iç köşesi yuvarlak).
- **J2 U şeklinde**: yalnız −x dolgusu y'yi serbest bırakırdı (±3.5); iki ray küpü y=0'da tutar.
- **Stand iki dosya**: 05_stand_ayak_x2.stl (iki ayak, aynı parça) + 06_stand_tabla.stl; tek 05_stand.stl yerine (tek parça 204 mm yükseklikte zayıf ve uzun baskı olurdu).

## Basılabilirlik
| parça | yön | destek | not |
|---|---|---|---|
| 01 taban (SİYAH) | alt yüz tablada | yok | 0.2 mm katman şart: kağıt cebi 0.2 = tam 1 katman. Kabartmalar 0.4 = 2 katman. Mat siyah PLA (markerler kağıtta). 4 mm kalın düz plaka → ilk katman temiz olmalı; köşe kalkması riskine brim/kenar fare kulağı. |
| 02-04 jig | alt yüz tablada, yazı üstte | yok | Renk kırmızı OLMASIN (kırmızı küp segmentasyonu); siyah/gri. J0 yazısı 2.4 mm, 0.4 nozulda okunaklılık sınırda. |
| 05 ayak x2 | iç yüz tablada, payandalar dik | yok | 204x190 mm, 256 tablaya sığar. 45 mm dik duvarlar; %15-20 dolgu, 3 duvar. |
| 06 tabla | alt yüz tablada, raylar üstte | yok | Yarıklar dik geçiş; köprü yok. |

Toplam malzeme (%100 dolu üst sınır): plaka ~92 g, jigler 3x1.5 g, ayaklar ~219 g, tabla ~116 g. Gerçek (%15 dolgu, 3 duvar) yaklaşık bunun %40-55'i (slicer'da doğrulanmadı).

## Doğrulanamayanlar
- Telefon ölçüsü (Poco modeli bilinmiyor; 76x165x9 varsayıldı, kanal 80 → 79 mm'ye kadar telefon). Kamera yeri ve FOV (26 mm eşdeğer ana kamera varsayımı); kamera çıkıntısı pencereye (50x72) sığmalı.
- Gerçek basılı kutunun iç ölçüsü 22.0 mi (basılı iç boşluk genelde 0.1-0.2 küçük çıkar; jig sıkıysa JIG_PAY_KUTU 0.15-0.2 yap).
- Dil-yarık 0.2 mm sıkılığı (yazıcıya bağlı). Stand x yönünde (köprü boyunca) sallanma rijitliği ölçülmedi.
- SVG yazdırma ölçeği yazıcıya bağlı → sayfadaki 100 mm cetvelle kontrol.
- Slicer açılmadı (istenmedi): ilk katman, süre, gerçek gramaj ölçülmedi.
