# Aşama 0 v3 — MONTAJ

## 1. Baskı (Elegoo Centauri Carbon 2, PLA, 0.4 nozul)
| dosya | renk | adet | ayar |
|---|---|---|---|
| stl/01_taban_SIYAH.stl | mat siyah | 1 | **katman 0.2 mm** (kağıt cebi tam 1 katman), %15 dolgu, 3 duvar, destek yok, brim önerilir |
| stl/02_jig_J0.stl, 03_jig_J1.stl, 04_jig_J2.stl | siyah/gri (kırmızı DEĞİL) | 1'er | 0.12-0.16 mm katman (küçük yazı), %100 dolgu, destek yok |
| stl/05_stand_ayak_x2.stl | herhangi | 1 dosya = 2 ayak | 0.2 mm, %15-20 dolgu, 3 duvar, destek yok |
| stl/06_stand_tabla.stl | herhangi | 1 | 0.2 mm, %20 dolgu, 3 duvar, destek yok |

Baskıdan sonra: kutuyu (v2) plakadaki yuvaya koy → kendi ağırlığıyla tabana oturmalı, 0.3 mm/yan boşluk. Jig kutuya zorlanmadan girmeli; sıkıysa ince zımpara (dış yüz) ya da `olcu.py` → `JIG_PAY_KUTU` 0.15 yapıp yeniden üret.

## 2. Marker sayfası
1. `marker_sayfasi.html`'i tarayıcıda aç → Yazdır: kâğıt A4, **ölçek %100 / gerçek boyut**, "sayfaya sığdır" KAPALI, kenar boşluğu "yok/varsayılan", arka plan grafikleri açık. (Ya da `marker_sayfasi.svg`'yi Inkscape'ten %100 yazdır.)
2. **Ölçek kontrolü**: alt kısımdaki cetveli gerçek cetvelle ölç: 100 mm ± 0.5 değilse KULLANMA, yazdırma ayarını düzelt. Marker siyah karesi 35.0 mm, gri kesim karesi 45.0 mm olmalı.
3. Mat kâğıt, lazer yazıcı tercih (mürekkep parlar/şişirir). Sayfada 2 takım var (üst = asıl, alt = yedek).

## 3. Kesme ve yapıştırma
1. Maket bıçağı + çelik cetvelle gri çizginin **tam üstünden** kes (45x45). Makas kenarı dalgalandırır.
2. Kesilen kâğıdın üst kenarında açık gri "↑ +y idNN" yazısı var: bu kenar plakadaki oka (+y yönü) baksın. Yerleşim plakada: sol üst id10, sağ üst id11, sağ alt id12, sol alt id13 (yukarıdan bakınca, "+y" yazısı üstte).
3. Yapıştırıcı: stick yapıştırıcıyı **tüm arkaya ince ve eşit** sür ya da çift taraflı bandı kenarlardan kenara tam kaplayacak şekilde yapıştır (yalnız köşelere bant → kâğıt kabarır, z değişir). Kalın köpük bant KULLANMA (z hesabı 0.05 mm yapıştırıcı varsayar).
4. Kâğıdı cebe koy, cepte ortala (yan başına ~0.2 mm boşluk kalır; bir köşeye yaslamak markeri 0.2 mm kaydırır), ortadan kenarlara bastırarak hava çıkar. Kabarcık/kıvrım olmamalı.
5. Değiştirmek için cımbızı yuvanın dış kenarındaki yarım daire oyuğa sok.

## 4. Stand
1. Ayakları dik koy: payandalar dışa, düz iç yüzler birbirine bakar (iç yüzler arası 160 mm).
2. Tablayı üstten indir: her ayağın 2 dili tabladaki yarıklara girer (sıkı geçme, 0.2 mm/yan). Gevşekse bir damla CA; çok sıkıysa dili zımparala.
3. "KAMERA >" yazılı uç durağa doğru: telefonu **ekran yukarı**, arka kamera ucu durağa dayalı yatır; kamera pencerede kalmalı (kamera merceği pencere kenarlarından ≥5 mm içeride).
4. Plaka (kutu üstünde) köprünün altına, ayakların arasına; plaka kenarı ile ayaklar arası ~10 mm. Plakanın tam ortalanması gerekmez — poz markerlerden çözülür; yeter ki telefon görüntüsünde **4 marker birden** görünsün (uygulamada kontrol et).
5. Yükseklik sabit: tabla üstü → plaka üstü 200 mm (lens ~198-199 mm). Ayarlanmaz.

## 5. Jig kullanımı
Kutu kapağını aç → jig'i kutu tabanına bırak → küpü jig'in boşluğuna koy (J1'de küpü +x,+y duvarlarına, J2'de +x duvarına it) → kapak. Küp merkezleri (sözleşme koord.): J0 (0,0,7.5), J1 (+3.5,+3.5,7.5), J2 (+3.5,0,7.5); geometri_v3.json → `jigler`.
