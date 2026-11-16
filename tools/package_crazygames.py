"""Builds crazygames/borderwise-crazygames.zip: index.html at the zip root plus everything the game loads."""
import os, zipfile, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'crazygames', 'borderwise-crazygames.zip')
INCLUDE = ['index.html', 'css', 'fonts', 'js', 'data']
files = []
for item in INCLUDE:
    p = os.path.join(ROOT, item)
    if os.path.isfile(p): files.append(item)
    else:
        for d, _, fs in os.walk(p):
            for f in fs:
                if f.startswith('.') or f.endswith('.map'): continue
                files.append(os.path.relpath(os.path.join(d, f), ROOT))
files.sort()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in files:
        z.write(os.path.join(ROOT, f), f.replace(os.sep, '/'))
raw = sum(os.path.getsize(os.path.join(ROOT, f)) for f in files)
print(f'{len(files)} files, {raw/1048576:.1f} MB unpacked, {os.path.getsize(OUT)/1048576:.1f} MB zipped -> {OUT}')
