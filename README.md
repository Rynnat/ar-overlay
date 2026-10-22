# AR Overlay

Telefon tarayıcısında, kutunun içindeki gizli küpü kamera görüntüsüne bindiren deney düzeneği.

**Soru:** Dışarıdan takip, içerideki nesne hareket edince ne kadar yanılır?

**Deney:**
1. Küp kutunun ortasındayken overlay doğru oturur. Bu ideal durum.
2. Küp çalkalanınca overlay yanılır.
3. Hata, önceden hesaplanan zarfla kıyaslanır.

- `app/`: web uygulaması (OpenCV.js 4.9.0). Canlı adres: https://rynnat.github.io/ar-overlay/app/
- `asama0/v2/`: CadQuery modeli (`kutu.py`), STL'ler ve `geometri.json`

## Durum

v0, markersız: Beyaz kağıt üstündeki koyu kutunun üst yüzü bulunur ve konumu solvePnP (IPPE_SQUARE) ile hesaplanır.

Kamera kalibrasyonu yok; görüş açısı elle ayarlanır.
