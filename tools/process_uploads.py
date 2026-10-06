"""Turns PDFs dropped in uploads/ into website issues. Run by the GitHub Action."""
import json, re, subprocess, shutil, datetime, glob, os
from zoneinfo import ZoneInfo
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
issues = json.load(open("issues.json"))
added = []

for pdf in sorted(glob.glob("uploads/*.pdf") + glob.glob("uploads/*.PDF")):
    nums = re.findall(r"\d+", os.path.basename(pdf))
    if not nums:
        print(f"Skipping {pdf}: no issue number in the file name")
        continue
    num = int(nums[-1])
    out = f"issues/{num}"
    os.makedirs(out, exist_ok=True)
    for old in glob.glob(f"{out}/p*.jpg"):
        os.remove(old)
    subprocess.run(["pdftoppm", "-jpeg", "-jpegopt", "quality=78", "-scale-to-x", "2400", "-scale-to-y", "-1", pdf, f"{out}/p"], check=True)
    pages = sorted(glob.glob(f"{out}/p-*.jpg"), key=lambda p: int(re.findall(r"\d+", os.path.basename(p))[0]))
    for i, p in enumerate(pages, 1):
        os.rename(p, f"{out}/p{i}.jpg")
    first = Image.open(f"{out}/p1.jpg")
    w, h = first.size
    cover = first.crop((w // 2, 0, w, h)) if w > h else first
    cover.thumbnail((800, 1100))
    cover.save(f"{out}/cover.jpg", quality=80)
    shutil.move(pdf, f"{out}/issue.pdf")
    today = datetime.datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    old = next((i for i in issues if i["num"] == num), {})
    issues = [i for i in issues if i["num"] != num]
    issues.append({**old, "num": num, "title": old.get("title", ""), "date": old.get("date", today), "pages": len(pages)})
    added.append(num)

if added:
    issues.sort(key=lambda i: -i["num"])
    json.dump(issues, open("issues.json", "w"), indent=1, ensure_ascii=False)
    print("Added issues:", added)
else:
    print("No new PDFs")
