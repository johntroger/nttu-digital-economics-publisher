import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("renderer", ROOT/"scripts/render-samples.py")
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
BATCH = json.loads((ROOT/"content/samples-2026-v1.json").read_text(encoding="utf-8"))

def luminance(color):
    rgb = [int(color[i:i+2],16)/255 for i in (1,3,5)]
    linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    return sum(v*w for v,w in zip(linear,[.2126,.7152,.0722]))

class RenderChecks(unittest.TestCase):
    def test_all_images_dimensions_text_bounds_and_nonoverlap(self):
        for sample in BATCH["samples"]:
            with self.subTest(id=sample["id"]):
                canvas=renderer.Canvas(sample);image=canvas.render()
                self.assertEqual(image.size,(1080,1080))
                for text in canvas.texts:
                    x1,y1,x2,y2=text["bbox"]
                    self.assertGreaterEqual(x1,48);self.assertLessEqual(x2,1032)
                    self.assertGreaterEqual(y1,184);self.assertLessEqual(y2,1048)
                    self.assertGreaterEqual(text["size"],34)
                for i,first in enumerate(canvas.texts):
                    for second in canvas.texts[i+1:]:
                        a,b=first["bbox"],second["bbox"]
                        self.assertFalse(max(a[0],b[0])<min(a[2],b[2]) and max(a[1],b[1])<min(a[3],b[3]),(first["text"],second["text"]))

    def test_three_logos_order_same_row_and_aspect_ratio(self):
        for sample in BATCH["samples"]:
            canvas=renderer.Canvas(sample);canvas.render()
            self.assertEqual([l["file"] for l in canvas.logos],["nttu.png","fba.png","digital-economics.jpg"])
            centers=[]
            for logo in canvas.logos:
                x1,y1,x2,y2=logo["bbox"];centers.append((y1+y2)/2)
                with Image.open(ROOT/"assets/brand/originals"/logo["file"]) as original:
                    self.assertAlmostEqual((x2-x1)/(y2-y1),original.width/original.height,delta=.01)
            self.assertLess(max(centers)-min(centers),3)

    def test_content_text_contrast_exceeds_4_5(self):
        for sample in BATCH["samples"]:
            canvas=renderer.Canvas(sample);canvas.render()
            for text in canvas.texts:
                a,b=sorted([luminance(text["color"]),luminance(text["background"])])
                self.assertGreaterEqual((b+.05)/(a+.05),4.5,text["text"])

    def test_overlong_title_is_blocked_instead_of_shrinking(self):
        sample=json.loads(json.dumps(BATCH["samples"][0]));sample["image"]["headline"]="Nội dung quá dài "*30
        with self.assertRaisesRegex(ValueError,"TEXT_OVERFLOW"):renderer.Canvas(sample).render()

    def test_missing_glyph_is_blocked(self):
        sample=json.loads(json.dumps(BATCH["samples"][0]));sample["image"]["subline"]="Không có glyph: 🚀"
        with self.assertRaisesRegex(ValueError,"Missing glyphs"):renderer.Canvas(sample).render()

    def test_missing_font_blocks_render(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError):renderer.Canvas(BATCH["samples"][0],Path(folder))

    def test_low_contrast_blocks_render(self):
        sample=json.loads(json.dumps(BATCH["samples"][0]));sample["image"]["ink"]="#FFFFFF"
        with self.assertRaisesRegex(ValueError,"LOW_TEXT_CONTRAST"):renderer.Canvas(sample).render()

    def test_unknown_layout_is_blocked(self):
        sample=json.loads(json.dumps(BATCH["samples"][0]));sample["image"]["template"]="bad"
        with self.assertRaisesRegex(ValueError,"Unknown template"):renderer.Canvas(sample).render()

    def test_render_reproduces_pinned_png_pixels(self):
        for sample in BATCH["samples"]:
            canvas=renderer.Canvas(sample);image=canvas.render()
            with Image.open(ROOT/f'assets/samples/v1/{sample["id"]}.png') as pinned:
                self.assertEqual(image.tobytes(),pinned.tobytes())

if __name__ == "__main__":unittest.main(verbosity=2)
