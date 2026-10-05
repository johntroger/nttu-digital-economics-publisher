"""Deterministic square artwork. Does not edit original logos or call AI/network."""
from pathlib import Path
import argparse
import hashlib
import json
import struct
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SCALE = 2
SIZE = 1080
FONT_FILES = {"title": "BricolageGrotesque-Bold.ttf", "bold": "WorkSans-Bold.ttf", "body": "WorkSans-Regular.ttf"}
IDS = {"P02", "P04", "P05", "P06", "P08"}
LOGOS = [("nttu.png", (64, 26, 444, 146)), ("fba.png", (594, 32, 702, 140)), ("digital-economics.jpg", (828, 24, 1008, 144))]

def contrast(first, second):
    def luminance(color):
        rgb = [int(color[i:i+2],16)/255 for i in (1,3,5)]
        linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
        return sum(v*w for v,w in zip(linear,[.2126,.7152,.0722]))
    dark, light = sorted([luminance(first),luminance(second)])
    return (light+.05)/(dark+.05)

def glyphs(path):
    """Read Unicode cmap formats 4/12; no optional font inspection dependency."""
    data = path.read_bytes()
    tables = struct.unpack_from(">H", data, 4)[0]
    offset = None
    for i in range(tables):
        tag, _, start, _ = struct.unpack_from(">4sIII", data, 12 + i * 16)
        if tag == b"cmap":
            offset = start
    if offset is None:
        raise ValueError("Font has no cmap")
    count = struct.unpack_from(">H", data, offset + 2)[0]
    result = set()
    for i in range(count):
        platform, encoding, relative = struct.unpack_from(">HHI", data, offset + 4 + i * 8)
        if platform not in (0, 3) or (platform == 3 and encoding not in (1, 10)):
            continue
        start = offset + relative
        form = struct.unpack_from(">H", data, start)[0]
        if form == 12:
            groups = struct.unpack_from(">I", data, start + 12)[0]
            for g in range(groups):
                first, last, gid = struct.unpack_from(">III", data, start + 16 + g * 12)
                result.update(cp for cp in range(first, last + 1) if gid + cp - first)
        elif form == 4:
            segments = struct.unpack_from(">H", data, start + 6)[0] // 2
            end_at = start + 14
            start_at = end_at + 2 * segments + 2
            delta_at = start_at + 2 * segments
            range_at = delta_at + 2 * segments
            for g in range(segments):
                first = struct.unpack_from(">H", data, start_at + 2*g)[0]
                last = struct.unpack_from(">H", data, end_at + 2*g)[0]
                delta = struct.unpack_from(">h", data, delta_at + 2*g)[0]
                distance = struct.unpack_from(">H", data, range_at + 2*g)[0]
                for cp in range(first, last + 1):
                    if distance:
                        gid = struct.unpack_from(">H", data, range_at + 2*g + distance + 2*(cp-first))[0]
                        gid = (gid + delta) & 65535 if gid else 0
                    else:
                        gid = (cp + delta) & 65535
                    if gid:
                        result.add(cp)
    return result

class Canvas:
    def __init__(self, sample, fonts=ROOT / "assets/fonts"):
        self.sample = sample
        self.spec = sample["image"]
        self.image = Image.new("RGB", (SIZE*SCALE, SIZE*SCALE), self.spec["paper"])
        self.draw = ImageDraw.Draw(self.image)
        self.fonts = fonts
        self.coverage = {key: glyphs(fonts / name) for key, name in FONT_FILES.items()}
        self.texts = []
        self.logos = []

    def coords(self, coords):
        return tuple(round(v*SCALE) for v in coords)

    def box(self, coords, fill, radius=0, outline=None, width=1):
        self.draw.rounded_rectangle(self.coords(coords), radius*SCALE, fill=fill, outline=outline, width=width*SCALE)

    def ellipse(self, coords, fill, outline=None, width=1):
        self.draw.ellipse(self.coords(coords), fill=fill, outline=outline, width=width*SCALE)

    def line(self, coords, fill, width=2):
        self.draw.line(self.coords(coords), fill=fill, width=width*SCALE, joint="curve")

    def poly(self, coords, fill):
        self.draw.polygon([self.coords(p) for p in coords], fill=fill)

    def text(self, value, x, y, size=36, role="body", color=None, max_width=952, background=None):
        if "\n" in value:
            raise ValueError("Use explicit line layout")
        missing = sorted({c for c in value if not c.isspace() and ord(c) not in self.coverage[role]})
        if missing:
            raise ValueError(f"Missing glyphs: {missing}")
        if contrast(color or self.spec["ink"], background or self.spec["paper"]) < 4.5:
            raise ValueError(f"LOW_TEXT_CONTRAST {value!r}")
        font = ImageFont.truetype(str(self.fonts/FONT_FILES[role]), size*SCALE)
        xy = self.coords((x, y))
        bbox = tuple(v/SCALE for v in self.draw.textbbox(xy, value, font=font, anchor="lt"))
        if bbox[2]-bbox[0] > max_width or bbox[0] < 48 or bbox[2] > 1032 or bbox[1] < 184 or bbox[3] > 1048:
            raise ValueError(f"TEXT_OVERFLOW {value!r}: {bbox}")
        self.draw.text(xy, value, font=font, fill=color or self.spec["ink"], anchor="lt")
        self.texts.append({"text": value, "bbox": bbox, "size": size, "role": role, "color": color or self.spec["ink"], "background": background or self.spec["paper"]})

    def header(self):
        self.box((0, 0, 1080, 170), "#FFFFFF")
        for name, area in LOGOS:
            original = ROOT / "assets/brand/originals" / name
            with Image.open(original) as opened:
                logo = opened.convert("RGBA")
                ratio = min((area[2]-area[0])/logo.width, (area[3]-area[1])/logo.height)
                width, height = round(logo.width*ratio*SCALE), round(logo.height*ratio*SCALE)
                logo = logo.resize((width, height), Image.Resampling.LANCZOS)
                x = round((area[0]+area[2])*SCALE/2-width/2)
                y = round((area[1]+area[3])*SCALE/2-height/2)
                self.image.paste(logo, (x, y), logo)
                self.logos.append({"file":name, "sha256":hashlib.sha256(original.read_bytes()).hexdigest(), "bbox":[x/SCALE,y/SCALE,(x+width)/SCALE,(y+height)/SCALE]})
        headline = self.spec["headline"].split("\n")
        if not 1 <= len(headline) <= 2:
            raise ValueError("Headline requires at most two lines")
        for index, value in enumerate(headline):
            self.text(value, 64, 220+index*88, 72, "title")
        self.text(self.spec["subline"], 64, 417, 38)

    def arrow(self, x, y, color):
        self.line((x, y, x+62, y), color, 5)
        self.poly([(x+62,y),(x+48,y-10),(x+48,y+10)], color)

    def render(self):
        self.header()
        accent, ink = self.spec["accent"], self.spec["ink"]
        template, cards = self.spec["template"], self.spec["cards"]
        if template == "checklist":
            if len(cards) != 4:
                raise ValueError("Checklist needs four items")
            for index, (title, detail) in enumerate(cards):
                y = 502 + index*114
                self.box((64,y,1016,y+98), "#FFFFFF", 16)
                self.ellipse((86,y+23,138,y+75), self.spec["paper"])
                self.text(str(index+1), 102, y+31, 34, "bold", accent)
                self.text(title, 168, y+12, 40, "bold", background="#FFFFFF")
                self.text(detail, 168, y+56, 36, max_width=816, background="#FFFFFF")
        elif template == "flow":
            if len(cards) != 3:
                raise ValueError("Flow needs three items")
            for index, (title, detail) in enumerate(cards):
                y = 502 + index*154
                self.box((64,y,1016,y+124), "#FFFFFF", 16)
                self.box((64,y,74,y+124), accent, 4)
                self.text(str(index+1), 100, y+32, 56, "title", accent, background="#FFFFFF")
                self.text(title, 202, y+20, 43, "bold", background="#FFFFFF")
                self.text(detail, 202, y+75, 36, max_width=775, background="#FFFFFF")
                if index < 2:
                    self.line((123,y+124,123,y+149), accent, 3)
                    self.poly([(123,y+151),(115,y+140),(131,y+140)], accent)
        elif template == "scene":
            if cards:
                raise ValueError("Illustration does not use checklist cards")
            scene = self.spec["scene"]
            if scene == "portfolio":
                self.box((90,530,404,914), "#FFFFFF", 20)
                self.box((136,585,244,591), accent, 3)
                self.text("CV", 134, 617, 60, "title", background="#FFFFFF")
                for y, w in [(728,218),(760,160),(792,218),(824,185)]:
                    self.box((134,y,134+w,y+9), "#CBD9EE", 4)
                self.arrow(451, 725, accent)
                self.box((559,502,984,914), "#FFFFFF", 20)
                self.text("Dự án", 604, 545, 43, "bold", background="#FFFFFF")
                self.box((604,630,938,840), self.spec["paper"], 12)
                self.line((640,798,640,672), ink, 2)
                self.line((640,798,902,798), ink, 2)
                for x, h in [(676,48),(734,86),(792,62),(850,118)]:
                    self.box((x,795-h,x+32,795), accent, 5)
                self.line((607,880,921,880), "#CBD9EE", 7)
            elif scene == "bridge":
                self.ellipse((348,528,732,912), "#FFFFFF")
                self.line((268,708,809,708), accent, 8)
                self.box((83,582,375,836), "#FFFFFF", 22)
                self.poly([(104,650),(134,600),(324,600),(354,650)], accent)
                self.box((125,650,333,777), self.spec["paper"], 0, accent, 4)
                self.box((158,685,213,777), "#FFFFFF", 2, accent, 3)
                self.box((237,685,298,736), "#FFFFFF", 2, accent, 3)
                self.box((707,582,997,836), "#FFFFFF", 22)
                for x, h in [(752,75),(815,117),(878,156)]:
                    self.box((x,790-h,x+36,790), accent, 6)
                self.ellipse((468,630,612,774), accent)
                self.line((504,702,532,730,578,676), "#FFFFFF", 8)
                self.text("Kinh doanh", 113, 874, 39, "bold")
                self.text("Dữ liệu", 790, 874, 39, "bold")
            elif scene == "operations":
                self.box((64,518,386,671), "#FFFFFF", 22)
                self.text("Mua", 163, 565, 51, "bold", accent, background="#FFFFFF")
                self.arrow(421, 590, accent)
                self.poly([(605,565),(813,504),(970,581),(765,646)], "#E8BD98")
                self.poly([(605,565),(765,646),(765,862),(605,777)], "#DFA77B")
                self.poly([(765,646),(970,581),(970,792),(765,862)], "#F1CCAC")
                self.line((720,531,879,610,879,689), "#FFFFFF", 20)
                self.box((809,716,918,775), "#FFFFFF", 5)
                self.line((825,734,901,734), ink, 3)
                self.line((825,747,885,747), ink, 3)
                # A short, readable status list anchors the logistics illustration.
                for index, label in enumerate(["Tồn kho", "Xử lý đơn", "Phản hồi"]):
                    y = 727 + index*70
                    self.ellipse((87,y+4,113,y+30), accent)
                    self.text(label, 141, y, 40, "bold")
            else:
                raise ValueError("Unknown illustration scene")
        else:
            raise ValueError("Unknown template")
        self.text(self.spec["takeaway"], 64, 994, 36, "bold", max_width=952)
        return self.image.resize((SIZE,SIZE), Image.Resampling.LANCZOS)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT/"content/samples-2026-v1.json")
    parser.add_argument("--output", type=Path, default=ROOT/"assets/samples/v1")
    parser.add_argument("--single", action="store_true", help="Render one saved local editor version")
    args = parser.parse_args()
    input_data = json.loads(args.input.read_text(encoding="utf-8"))
    if args.single:
        import re
        if not isinstance(input_data, dict) or not re.fullmatch(r"(?:P(?:0[1-9]|[12][0-9]|30)|R(?:0[1-9]|10))", str(input_data.get("id", ""))):
            raise ValueError("Invalid editor post identity")
        input_data = {"samples": [input_data]}
    ids = [s["id"] for s in input_data["samples"]]
    if not args.single and (set(ids) != IDS or len(ids) != len(IDS)):
        raise ValueError("Expected the five approved sample identities")
    reports = []
    # Prepare every image first so validation failures do not write partial images.
    canvases = []
    for sample in input_data["samples"]:
        canvas = Canvas(sample)
        image = canvas.render()
        canvases.append((sample, canvas, image))
    args.output.mkdir(parents=True, exist_ok=True)
    for sample, canvas, image in canvases:
        path = args.output / f'{sample["id"]}.png'
        image.save(path, format="PNG", optimize=True)
        image.resize((360,360), Image.Resampling.LANCZOS).save(args.output/f'{sample["id"]}-360.png', format="PNG", optimize=True)
        reports.append({"id":sample["id"],"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"bytes":path.stat().st_size,"width":1080,"height":1080,"template":sample["image"]["template"],"texts":canvas.texts,"logos":canvas.logos,"font_sha256":{k:hashlib.sha256((ROOT/"assets/fonts"/v).read_bytes()).hexdigest() for k,v in FONT_FILES.items()},"input_sha256":hashlib.sha256(args.input.read_bytes()).hexdigest()})
    (args.output/"render-report.json").write_text(json.dumps({"renderer":"pillow-square-v1", "samples":reports},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Rendered {len(reports)} square images and 360px proofs; no network or AI.")

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
