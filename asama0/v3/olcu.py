"""Aşama 0 v3 ortak ölçüler (mm). taban.py, jig.py, stand.py, kontrol.py buradan okur.
KOORDİNAT SÖZLEŞMESİ (uygulama ile aynı, DEĞİŞTİRME): orijin kutunun yatay merkezi,
z=0 kutunun İÇ tabanı, +z yukarı (kameraya doğru), kutunun dış tabanı z=-2.5.
"""
from pathlib import Path

KLASOR = Path(__file__).parent
OUT = KLASOR / "stl"
OUT.mkdir(exist_ok=True)

# --- v2 kutu (basıldı; v2/kutu.py ile aynı) ---
KUTU_IC = 22.0
KUTU_DUVAR = 4.0
KUTU_DIS = KUTU_IC + 2 * KUTU_DUVAR      # 30
KUTU_TABAN_T = 2.5                        # dış taban z=-2.5
KUTU_DUVAR_Y = 24.0                       # iç tabandan duvar üstüne
KAPAK_T = 2.0                             # kapak üstü z=26
KUP = 15.0

# --- taban plakası ---
PLAKA = 140.0             # NOT: istenen 130'du; kağıt yuvası dış kenarı 64.7 -> 130'da kenar 0.3 mm kalıyordu
PLAKA_T = 4.0
PLAKA_UST_Z = -0.5        # kutu oturunca plaka üst yüzü
PLAKA_ALT_Z = PLAKA_UST_Z - PLAKA_T       # -4.5 (masa)
YUVA_PAY = 0.3            # yan başına (v2 ile aynı)
YUVA = KUTU_DIS + 2 * YUVA_PAY            # 30.6
YUVA_DERIN = PLAKA_UST_Z - (-KUTU_TABAN_T)   # 2.0
PAH = 1.0

MARKER = 35.0
KAGIT = 45.0
KAGIT_YUVA_PAY = 0.2      # yan başına; elle kesilen kağıt rahat girsin
KAGIT_YUVA = KAGIT + 2 * KAGIT_YUVA_PAY   # 45.4
KAGIT_YUVA_DERIN = 0.2
KAGIT_T = 0.10            # 80 g/m2 kağıt
YAPISTIRICI_T = 0.05      # stick / ince bant (tahmin)
MARKER_Z = PLAKA_UST_Z - KAGIT_YUVA_DERIN + KAGIT_T + YAPISTIRICI_T   # -0.55
KABARTMA = 0.4

MARKER_MERKEZ = {10: (-42.0, 42.0), 11: (42.0, 42.0), 12: (42.0, -42.0), 13: (-42.0, -42.0)}

# --- jig'ler ---
JIG_PAY_KUTU = 0.1        # yan başına (toplam -0.2)
JIG_PAY_KUP = 0.1         # yan başına (toplam +0.2)
JIG_H = 5.0
SERBEST = (KUTU_IC - KUP) / 2              # 3.5

# --- stand ---
TEL_EN, TEL_BOY, TEL_KALIN = 76.0, 165.0, 9.0   # varsayım (Poco serisi ~74-76 x 160-165 x 8-9)
KANAL = 80.0              # telefon kanalı iç genişliği (en 79 mm'ye kadar telefon)
LENS_YUKSEKLIK = 200.0    # tabla üst yüzü -> plaka üst yüzü
