# Aşama 0 ön-kayıt

Tarih: 2026-10-23. Yazılım: v1.0. Bu dosya ölçümden ÖNCE yazıldı. Sonradan değişirse git geçmişinde görünür.

Kaynak: `reports/AR overlay görüntü işleme geliştirme.md`, bölüm 6.

## İddia

**Jig'li kutu poz doğruluğu.** Telefon tarayıcısındaki tek kameralı overlay, taban plakasına oturtulmuş kutunun içindeki gizli küpün yerini kaç mm hatayla gösterir?

Çalkalama deneyi kanıt sayılmaz, **gösterim** sayılır. "Küp kayınca overlay yanılır" önermesi tanım gereği doğru olduğu için çürütülemez.

## Düzenek

| Parça | Ölçü |
|---|---|
| Kutu (v2) | dış 30 mm, iç 22 mm |
| Küp | 15 mm. Eksen başına ±3.5 mm, köşegende 4.95 mm serbest yol. |
| Taban plakası (v3) | 4 ArUco, DICT_4X4_50 id 10-13. Marker 35 mm, merkezleri (±42, ±42) mm. |
| Kamera | Poco, Chrome. Standda 20 cm yükseklikte. Kalibrasyon taban plakasıyla yapılır. |

Pozlama ve odak kilidi varsa kullanılır. `getSettings()` kayda yazılır.

**Yer gerçeği** kameradan bağımsızdır: dijital kumpas. Küp konumu jig'lerle verilir:

| Jig | Küp konumu |
|---|---|
| J0 | orta |
| J1 | (+3.5, +3.5) |
| J2 | (+3.5, 0) |

## Ölçümler ve eşikler

### G0: hassasiyet

- Sabit telefon, 300 kare, 0°/20°/35°/45° açı, iki poz kaynağı (aruco, markersız).
- **Hedef:** ham taban köşesi σ < 0.5 px ve 300 karede flip = 0.
- Bu hedef kendi koyduğumuz bir hedef, literatürden gelmiyor.
- 0° açı en kötü durum olarak raporlanır.

### G1-a: negatif kontrol

- J0, 5 poz × 2 mesafe × 10 tekrar (n=100). Her tekrarda kutu yuvaya yeniden konur.
- Ölçülen: uygulamanın verdiği küp yeri (ışın-düzlem kesişimi) ile 0 arasındaki fark.

### G1-b: pozitif kontrol

- J1 ve J2, n=50+50.
- Sistemin ölçtüğü ofset ile kumpasın ölçtüğü ofset karşılaştırılır.
- Regresyon raporlanır: eğim, kesişim, artık SD.

### Geçme koşulu

J0'da TRE95 < 1.5 mm **ve** J1 ofseti 4.95 ± 1 mm.

### Beklenen sonuç: GEÇMEZ

Tahminimiz mutlak hatanın 1.5-3 mm olacağı yönünde. Geçmezse rapor "bu düzenek ±3.5 mm yer değiştirmeyi ayırt edemiyor" der.

Sonraki seçenek iç boşluğu 26 mm yapmak; o zaman eksen başına ±5.5 mm olur. Bu bir tasarım değişikliği olduğu için kullanıcı onayı gerekir.

## Raporlama kuralları

- Her ölçüm için ortalama, SD, medyan, p95 ve maksimum verilir.
- Ham JSON'lar (uygulamanın "Ölç" çıktısı, sürüm damgalı) eklenir.
- Hariç tutulan denemeler gerekçesiyle yazılır.
- FRE (marker köşelerinin yeniden izdüşüm hatası) **doğruluk olarak sunulmaz**.
- Filtreli (1€) sayı raporlanmaz. Uygulama zaten ham pozdan ölçüyor.
- Kapak çıkıkken markersız pozla yapılan ölçüm "yanlı" diye işaretlenir ve dışarıda bırakılır.
- Moreta-Martinez 2021'deki 2.80±0.98 mm 3B bir hatadır (Polaris'le izlenen işaretçi). Bizim 2B sayımızla doğrudan kıyaslanmaz.
