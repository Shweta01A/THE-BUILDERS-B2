from PIL import Image
import glob

for f in glob.glob("assests/*.png"):
    im = Image.open(f)
    out = f[:-4] + ".webp"
    if "worker" in f:
        im.save(out, "WEBP", quality=90, method=6)
    else:
        im.convert("RGB").save(out, "WEBP", quality=80, method=6)
    print(f, "->", out)
