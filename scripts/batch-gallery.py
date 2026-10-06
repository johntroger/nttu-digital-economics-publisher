"""PDF contact gallery for human design review; original artwork stays unchanged."""
from pathlib import Path
import json,sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
ROOT=Path(__file__).resolve().parent.parent
batch=json.loads((ROOT/'content/batch-2026-v1.json').read_text(encoding='utf-8'))
pdfmetrics.registerFont(TTFont('WorkSans',str(ROOT/'assets/fonts/WorkSans-Regular.ttf')))
pdfmetrics.registerFont(TTFont('WorkSansBold',str(ROOT/'assets/fonts/WorkSans-Bold.ttf')))
out=ROOT/'assets/batch/v1/design-gallery.pdf'
pdf=canvas.Canvas(str(out),pagesize=A4)
pdf.setTitle('Kho 40 bài Kinh tế số NTTU — Duyệt thiết kế')
pdf.setAuthor('NTTU Digital Economics Publisher')
w,h=A4
def wrapped(text,max_width,size):
    lines=['']
    for word in text.split():
        proposed=(lines[-1]+' '+word).strip()
        if pdfmetrics.stringWidth(proposed,'WorkSans',size)>max_width and lines[-1]:lines.append(word)
        else:lines[-1]=proposed
    return lines
for offset in range(0,40,4):
    pdf.setFillColor(HexColor('#17324c'));pdf.setFont('WorkSansBold',19)
    pdf.drawString(30,h-42,'Kho content · Kinh tế số NTTU')
    pdf.setFont('WorkSans',10);pdf.drawString(30,h-64,f"30 bài chính + 10 dự phòng · Trang {offset//4+1}/10 · Chưa đăng Facebook")
    for n,p in enumerate(batch['posts'][offset:offset+4]):
        x=30+(n%2)*273;y=h-332-(n//2)*354
        pdf.drawImage(ImageReader(str(ROOT/f"assets/batch/v1/{p['id']}.png")),x,y,width=260,height=260)
        pdf.setFillColor(HexColor('#17324c'));pdf.setFont('WorkSansBold',10)
        state='Đã duyệt' if p['editorial_status']=='owner_approved' else 'Chờ duyệt'
        pdf.drawString(x,y-17,f"{p['id']} · {'Chính' if p['pool']=='main' else 'Dự phòng'} · {p['audience']} · {state}")
        pdf.setFont('WorkSans',10)
        for i,line in enumerate(wrapped(p['title'],260,10)):pdf.drawString(x,y-33-i*14,line)
    pdf.setFont('WorkSans',9);pdf.setFillColor(HexColor('#576b7c'))
    pdf.drawString(30,28,'Caption và căn cứ: mở content/batch/v1/catalog.md trong dự án.')
    pdf.showPage()
pdf.save()
print('Built 10-page local PDF gallery of all 40 unchanged images.')
