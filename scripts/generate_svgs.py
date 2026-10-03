import os
import base64
import numpy as np
from PIL import Image

pub_dir = r"C:\Users\Krish Shah\Documents\antigravity\keen-pasteur\apps\web\public"
app_dir = r"C:\Users\Krish Shah\Documents\antigravity\keen-pasteur\apps\web\app"

# Load sticker image
sticker_path = os.path.join(pub_dir, "chad-white-border.png")
sticker = Image.open(sticker_path)
sw, sh = sticker.size

# Read base64
with open(sticker_path, "rb") as f:
    b64_sticker = base64.b64encode(f.read()).decode("utf-8")

# 1. Standalone Sticker SVG (Transparent background, white sticker border)
svg_sticker = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {sw} {sh}" width="{sw}" height="{sh}">
  <defs>
    <filter id="chad-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.35" />
    </filter>
  </defs>
  <image href="data:image/png;base64,{b64_sticker}" width="{sw}" height="{sh}" filter="url(#chad-shadow)" preserveAspectRatio="xMidYMid meet" />
</svg>
"""

with open(os.path.join(pub_dir, "chad-sticker.svg"), "w", encoding="utf-8") as f:
    f.write(svg_sticker)
with open(os.path.join(pub_dir, "chad-logo.svg"), "w", encoding="utf-8") as f:
    f.write(svg_sticker)

# 2. Boxy Icon SVG (Favicon - Stripe Monochromatic Architectural style)
# 512x512 with crisp black box, 12px white border, centered GigaChad with white border
box = 512
aspect = sw / sh
target_h = int(box * 0.84)
target_w = int(target_h * aspect)
pos_x = (box - target_w) // 2
pos_y = (box - target_h) // 2 + 10

svg_icon = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#000000" />
  <rect x="8" y="8" width="496" height="496" fill="none" stroke="#ffffff" stroke-width="16" />
  <image href="data:image/png;base64,{b64_sticker}" x="{pos_x}" y="{pos_y}" width="{target_w}" height="{target_h}" preserveAspectRatio="xMidYMid meet" />
</svg>
"""

with open(os.path.join(pub_dir, "icon.svg"), "w", encoding="utf-8") as f:
    f.write(svg_icon)
with open(os.path.join(app_dir, "icon.svg"), "w", encoding="utf-8") as f:
    f.write(svg_icon)

print("Saved SVG files successfully:")
print(" -", os.path.join(pub_dir, "chad-sticker.svg"))
print(" -", os.path.join(pub_dir, "chad-logo.svg"))
print(" -", os.path.join(pub_dir, "icon.svg"))
print(" -", os.path.join(app_dir, "icon.svg"))
