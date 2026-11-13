"""Shrink raw captures (1170 × 2532 PNG) to the site's 780 × 1688 WebP files.
python3 to-webp.py <capture-dir> <name>[=<capture-name>] ...   e.g. prog-list feed-plugin=feed2"""
import sys
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
out = Path(__file__).resolve().parents[2] / "static" / "screens"
for arg in sys.argv[2:]:
    name, _, raw = arg.partition("=")
    im = Image.open(src / f"{raw or name}.png").convert("RGB").resize((780, 1688), Image.LANCZOS)
    im.save(out / f"{name}.webp", "WEBP", quality=86, method=6)
    print("wrote", out / f"{name}.webp")
