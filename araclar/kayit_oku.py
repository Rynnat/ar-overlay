"""ar-overlay-kayit reposundaki otomatik kayıtları indirip özetler.

Kullanım:
    python araclar/kayit_oku.py              # son oturum
    python araclar/kayit_oku.py --hepsi      # tüm oturumlar
    python araclar/kayit_oku.py 2026-10-23_161229

İndirilenler app/kayitlar/<oturum>/ altına (gitignore'da). gh CLI oturumu gerekir.
"""
import base64
import json
import statistics as st
import subprocess
import sys
from pathlib import Path

REPO = "Rynnat/ar-overlay-kayit"
HEDEF = Path(__file__).resolve().parent.parent / "app" / "kayitlar"


def gh(*arg):
    return subprocess.run(["gh", "api", *arg], capture_output=True, text=True, encoding="utf-8", check=True).stdout


def oturumlar():
    agac = json.loads(gh(f"repos/{REPO}/git/trees/main?recursive=1"))["tree"]
    dosyalar = [t["path"] for t in agac if t["type"] == "blob" and t["path"].startswith("kayit/")]
    gruplu = {}
    for d in dosyalar:
        gruplu.setdefault(d.split("/")[2], []).append(d)
    return dict(sorted(gruplu.items()))


def indir(yollar, oturum):
    klasor = HEDEF / oturum
    klasor.mkdir(parents=True, exist_ok=True)
    for y in sorted(yollar):
        hedef = klasor / Path(y).name
        if not hedef.exists():
            sha = json.loads(gh(f"repos/{REPO}/contents/{y}"))
            # büyük dosyalarda içerik boş gelir -> blob API
            icerik = sha.get("content") or json.loads(gh(f"repos/{REPO}/git/blobs/{sha['sha']}"))["content"]
            hedef.write_bytes(base64.b64decode(icerik))
    return klasor


def ozetle(klasor):
    print(f"\n=== {klasor.name} ===")
    for f in sorted(klasor.glob("*.json")):
        v = json.loads(f.read_text(encoding="utf-8"))
        if f.name.endswith("oturum.json"):
            k = (v.get("kamera") or {}).get("ayar") or {}
            print(f"oturum: {v.get('surum')} mod={v.get('mod')} kamera={k.get('width')}x{k.get('height')} kalib={'var' if v.get('kalib') else 'yok'}")
        elif "-olcum-" in f.name:
            o = v["ozet"]
            print(f"ÖLÇÜM {f.name}: {o['kare']} kare, {o['islenenFps']} fps (kamera {o['gelenFps']}), {o['msOrt']} ms (p95 {o['msP95']}), kalibreli={o['kalibreli']}")
            for kaynak in ("aruco", "markersiz"):
                s = o.get(kaynak) or {}
                if s.get("koseSdPx") is not None:
                    print(f"   {kaynak:9s} köşe σ {s['koseSdPx']} px (max {s['koseSdMaxPx']}) · küp-taban σ {s['kupTabanSdPx']} px · Z σ {s['uzaklikSdMm']} mm @ {s['uzaklikOrtMm']} · flip {s['flip5der']} · poz {s['poz']}")
                else:
                    print(f"   {kaynak:9s} {s.get('not', 'yok')} ({s.get('poz', 0)} poz)")
            if o.get("arucoMarkersizFarkPx"):
                print(f"   aruco↔markersız küp farkı: {o['arucoMarkersizFarkPx']}")
        elif "-kareler" in f.name:
            kr = v["kareler"]
            ms = [x["ms"] for x in kr if "ms" in x]
            a = sum(1 for x in kr if x.get("aruco"))
            m = sum(1 for x in kr if x.get("markersiz"))
            print(f"kareler {f.name}: {len(kr)} kayıt · aruco poz {a} · markersız tespit {m} · ms medyan {st.median(ms) if ms else '-'}")
        elif "-olay-" in f.name:
            print(f"olay {f.name}: {json.dumps(v, ensure_ascii=False)[:200]}")
        elif "teshis" in f.name:
            print(f"teşhis {f.name}: {json.dumps(v.get('teshis', {}), ensure_ascii=False)[:200]}")


if __name__ == "__main__":
    tum = oturumlar()
    if not tum:
        sys.exit("kayıt yok")
    secim = sys.argv[1] if len(sys.argv) > 1 else None
    hedefler = tum if secim == "--hepsi" else {secim: tum[secim]} if secim else dict([list(tum.items())[-1]])
    for ot, yollar in hedefler.items():
        ozetle(indir(yollar, ot))
