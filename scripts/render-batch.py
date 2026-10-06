"""Build the private 40-post artwork pack; preserve approved pixels exactly."""
from pathlib import Path
import importlib.util,json,hashlib,sys,shutil
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
module_spec=importlib.util.spec_from_file_location('sample_renderer',ROOT/'scripts/render-samples.py')
renderer=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(renderer)
APPROVED={'P02','P04','P05'}

class BatchCanvas(renderer.Canvas):
    def header(self):
        self.box((0,0,1080,170),'#FFFFFF')
        for name,area in renderer.LOGOS:
            original=ROOT/'assets/brand/originals'/name
            with Image.open(original) as opened:
                logo=opened.convert('RGBA')
                ratio=min((area[2]-area[0])/logo.width,(area[3]-area[1])/logo.height)
                w,h=round(logo.width*ratio*renderer.SCALE),round(logo.height*ratio*renderer.SCALE)
                logo=logo.resize((w,h),Image.Resampling.LANCZOS)
                x=round((area[0]+area[2])*renderer.SCALE/2-w/2)
                y=round((area[1]+area[3])*renderer.SCALE/2-h/2)
                self.image.paste(logo,(x,y),logo)
                self.logos.append({'file':name,'sha256':hashlib.sha256(original.read_bytes()).hexdigest(),'bbox':[x/2,y/2,(x+w)/2,(y+h)/2]})
        lines=self.spec['headline'].split('\n')
        if not 1<=len(lines)<=2:raise ValueError('Headline requires at most two lines')
        for i,line in enumerate(lines):self.text(line,64,210+i*100,72,'title')
        self.text(self.spec['subline'],64,417,38)
    def render(self):
        if self.spec['template']!='scene' or self.spec['scene']=='operations':
            return super().render()
        self.header()
        accent,ink=self.spec['accent'],self.spec['ink']
        identity=self.sample['id']
        if self.sample['group']=='D':
            # A dashboard with visible axes, summary blocks and a question marker.
            self.box((96,524,984,914),'#FFFFFF',24)
            for i,w in enumerate([200,250,290]):
                self.box((140+i*272,561,350+i*272,631),self.spec['paper'],12)
                self.line((164+i*272,596,164+i*272+min(w,158),596),accent,9)
            self.line((162,856,162,675),ink,3);self.line((162,856,892,856),ink,3)
            for i,h in enumerate([64,118,90,154,108]):
                self.box((214+i*133,850-h,272+i*133,850),accent,8)
            self.text('?',905,663,60,'title',background='#FFFFFF',max_width=60)
        elif identity in ['P12','P18','P28','R07']:
            # Project page linked to contribution/review notes, rather than a CV list.
            self.box((100,532,478,924),'#FFFFFF',22)
            self.text('Dự án',145,574,43,'bold',background='#FFFFFF')
            self.box((145,654,432,800),self.spec['paper'],12)
            self.poly([(176,762),(239,683),(297,737),(380,681),(405,762)],accent)
            self.line((145,846,418,846),ink,6)
            self.line((145,882,340,882),ink,6)
            self.arrow(501,725,accent)
            self.box((591,576,979,872),'#FFFFFF',22)
            self.text('Phần việc',628,615,40,'bold',background='#FFFFFF')
            for i in range(3):
                y=697+i*55
                self.ellipse((628,y,652,y+24),accent)
                self.line((680,y+12,930-i*35,y+12),ink,5)
        elif identity in ['P24','P30','R10']:
            # Workbook and evidence card for a study plan/self-assessment.
            self.box((130,530,950,926),'#FFFFFF',22)
            self.line((540,556,540,906),self.spec['paper'],8)
            self.text('Học',180,573,48,'bold',background='#FFFFFF')
            self.text('Thực hành',582,573,43,'bold',background='#FFFFFF',max_width=340)
            for i in range(4):
                y=683+i*57
                self.line((181,y,450-i*24,y),ink,5)
                self.box((591,y-15,907,y+23),self.spec['paper'],8)
                self.line((608,y+5,623,y+16,648,y-5),accent,5)
        else:
            # A process map with a branch to a human check: AI, workflow and choices.
            nodes=[(90,563,342,704),(414,563,666,704),(738,563,990,704)]
            labels=['Đầu vào','Xử lý','Kết quả']
            for area,label in zip(nodes,labels):
                self.box(area,'#FFFFFF',20)
                self.text(label,area[0]+27,area[1]+49,40,'bold',background='#FFFFFF',max_width=210)
            self.arrow(343,635,accent);self.arrow(667,635,accent)
            self.line((540,705,540,777),accent,5)
            self.box((315,778,765,902),'#FFFFFF',18)
            self.text('Kiểm tra',401,817,44,'bold',background='#FFFFFF',max_width=360)
            self.ellipse((823,803,950,930),accent)
            self.line((852,860,874,883,919,832),'#FFFFFF',7)
        self.text(self.spec['takeaway'],64,994,36,'bold',max_width=952)
        return self.image.resize((1080,1080),Image.Resampling.LANCZOS)

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    batch=json.loads((ROOT/'content/batch-2026-v1.json').read_text(encoding='utf-8'))
    out=ROOT/'assets/batch/v1';out.mkdir(parents=True,exist_ok=True)
    source_reports=json.loads((ROOT/'assets/samples/v1/render-report.json').read_text(encoding='utf-8'))
    approved=json.loads((ROOT/'content/samples/step22-approval.json').read_text(encoding='utf-8'))
    reports=[];pending=[]
    for post in batch['posts']:
        if post['id'] in APPROVED:
            approval=next(p for p in approved['samples'] if p['id']==post['id'])
            image=ROOT/f"assets/samples/v1/{post['id']}.png"
            if hashlib.sha256(image.read_bytes()).hexdigest()!=approval['image_sha256']:raise ValueError('Approved image changed')
            report=next(p for p in source_reports['samples'] if p['id']==post['id'])
            pending.append((post,None,None));reports.append(dict(report,approved_original=True))
        else:
            canvas=BatchCanvas(post);image=canvas.render()
            for i,a in enumerate(canvas.texts):
                for b in canvas.texts[i+1:]:
                    r,s=a['bbox'],b['bbox']
                    if max(r[0],s[0])<min(r[2],s[2]) and max(r[1],s[1])<min(r[3],s[3]):raise ValueError(f"Text collision {post['id']}: {a['text']} / {b['text']}")
            pending.append((post,canvas,image))
    for post,canvas,image in pending:
        target=out/f"{post['id']}.png";proof=out/f"{post['id']}-360.png"
        if post['id'] in APPROVED:
            shutil.copyfile(ROOT/f"assets/samples/v1/{post['id']}.png",target)
            shutil.copyfile(ROOT/f"assets/samples/v1/{post['id']}-360.png",proof)
        else:
            image.save(target,'PNG',optimize=True)
            image.resize((360,360),Image.Resampling.LANCZOS).save(proof,'PNG',optimize=True)
            reports.append({'id':post['id'],'width':1080,'height':1080,'texts':canvas.texts,'logos':canvas.logos,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'approved_original':False})
    (out/'render-report.json').write_text(json.dumps({'renderer':'pillow-batch-v1','samples':reports},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Rendered 40 square PNGs + 40 small previews; three approved originals preserved.')
if __name__=='__main__':main()
