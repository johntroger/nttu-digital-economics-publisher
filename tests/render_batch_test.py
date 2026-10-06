from pathlib import Path
import json,hashlib,importlib.util,unittest
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('batch_renderer',ROOT/'scripts/render-batch.py')
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
BATCH=json.loads((ROOT/'content/batch-2026-v1.json').read_text(encoding='utf-8'))
APPROVAL=json.loads((ROOT/'content/samples/step22-approval.json').read_text(encoding='utf-8'))

class BatchChecks(unittest.TestCase):
    def test_every_saved_png_contains_the_three_actual_logos_and_correct_dimensions(self):
        with Image.open(ROOT/'assets/samples/v1/P02.png') as source:
            expected=source.convert('RGB').crop((0,0,1080,168)).tobytes()
        for p in BATCH['posts']:
            with self.subTest(id=p['id']):
                path=ROOT/f"assets/batch/v1/{p['id']}.png"
                with Image.open(path) as image:
                    self.assertEqual(image.size,(1080,1080))
                    self.assertEqual(image.convert('RGB').crop((0,0,1080,168)).tobytes(),expected)
                self.assertLess(path.stat().st_size,5242880)
    def test_approved_full_and_preview_images_preserve_the_exact_approved_bytes(self):
        for p in APPROVAL['samples']:
            for suffix,key in [('', 'image_sha256'),('-360','proof_sha256')]:
                raw=(ROOT/f"assets/batch/v1/{p['id']}{suffix}.png").read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(),p[key])
    def test_all_previews_are_exact_downscaled_versions_of_full_images(self):
        for p in BATCH['posts']:
            with Image.open(ROOT/f"assets/batch/v1/{p['id']}.png") as image,Image.open(ROOT/f"assets/batch/v1/{p['id']}-360.png") as small:
                self.assertEqual(small.size,(360,360))
                self.assertEqual(small.tobytes(),image.resize((360,360),Image.Resampling.LANCZOS).tobytes())
    def test_all_unapproved_images_reproduce_and_have_safe_nonoverlapping_readable_text(self):
        for p in BATCH['posts']:
            if p['id'] in renderer.APPROVED:continue
            with self.subTest(id=p['id']):
                canvas=renderer.BatchCanvas(p);image=canvas.render()
                with Image.open(ROOT/f"assets/batch/v1/{p['id']}.png") as saved:self.assertEqual(image.tobytes(),saved.tobytes())
                for text in canvas.texts:
                    self.assertGreaterEqual(text['size'],34)
                    self.assertGreaterEqual(renderer.renderer.contrast(text['color'],text['background']),4.5)
                    x1,y1,x2,y2=text['bbox']
                    self.assertGreaterEqual(x1,48);self.assertLessEqual(x2,1032)
                    self.assertGreaterEqual(y1,184);self.assertLessEqual(y2,1048)
                for i,a in enumerate(canvas.texts):
                    for b in canvas.texts[i+1:]:
                        r,s=a['bbox'],b['bbox']
                        self.assertFalse(max(r[0],s[0])<min(r[2],s[2]) and max(r[1],s[1])<min(r[3],s[3]))
if __name__=='__main__':unittest.main(verbosity=2)
