import runpy,json,hashlib
from pathlib import Path
r=runpy.run_path('scripts/render-samples.py')
m=json.loads(Path('content/samples-2026-v1.manifest.json').read_text(encoding='utf-8'))['renderInputs']
fonts=[]
for f in m['fonts']:
 p=Path('assets/fonts')/f['name']; assert hashlib.sha256(p.read_bytes()).hexdigest()==f['sha256']
 chars=sorted(r['glyphs'](p)); ranges=[]
 for c in chars:
  if ranges and c==ranges[-1][1]+1:ranges[-1][1]=c
  else:ranges.append([c,c])
 fonts.append(dict(f,ranges=ranges))
Path('src/cloud/design-registry.ts').write_text('// Approved brand and OFL font metadata only. Originals stay private.\nexport const DESIGN_REGISTRY = '+json.dumps(dict(logos=m['logos'],fonts=fonts),ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
