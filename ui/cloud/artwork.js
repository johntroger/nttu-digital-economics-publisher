// Canvas-only renderer: pinned local fonts and private logo bytes; no external requests.
export const RENDERER='canvas-square-v1';
export class DesignError extends Error {constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new DesignError(code);};
export function contrast(a,b){const l=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const [x,y]=[l(a),l(b)].sort((a,b)=>a-b);return(y+.05)/(x+.05);}
export function validateSpec(d,resources){
  if(!d||!['infographic','illustration'].includes(d.layout)||!['network','process','portfolio'].includes(d.motif))fail('DESIGN_INVALID');
  for(const [key,max,required] of [['headline',160,true],['note',120,false]])if(typeof d[key]!=='string'||d[key].length>max||/[\x00-\x1f\x7f]/.test(d[key])||(required&&!d[key].trim()))fail('DESIGN_INVALID');
  if(![d.paper,d.ink,d.accent].every(c=>/^#[a-f0-9]{6}$/i.test(c)))fail('DESIGN_INVALID');
  if(contrast(d.ink,d.paper)<4.5||contrast(d.accent,d.paper)<4.5)fail('DESIGN_CONTRAST');
  if(!Array.isArray(d.points)||d.points.length!==(d.layout==='infographic'?3:0)||d.points.some(p=>typeof p!=='string'||!p.trim()||p.length>120||/[\x00-\x1f\x7f]/.test(p)))fail('DESIGN_INVALID');
  for(const font of resources.fonts)for(const c of [d.headline,d.note,...d.points].join('').normalize('NFC'))if(c.trim()&&!font.ranges.some(([a,b])=>c.codePointAt(0)>=a&&c.codePointAt(0)<=b))fail('DESIGN_GLYPH_MISSING');
}
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function verified(url,expected){const response=await fetch(url);if(!response.ok)fail(response.status===401?'SESSION_EXPIRED':'DESIGN_RESOURCE_FAILED');const bytes=await response.arrayBuffer();if(await hash(bytes)!==expected)fail('DESIGN_RESOURCE_CHANGED');return bytes;}
export async function loadDesignAssets(resources){
  if(resources.renderer!==RENDERER||resources.logos.length!==3||resources.fonts.length!==3||resources.logos.some(l=>!l.available))fail('DESIGN_LOGO_MISSING');
  const names=['ArtworkTitle','ArtworkBold','ArtworkBody'],fonts=[];
  for(const [i,font] of resources.fonts.entries()){const face=new FontFace(names[i],await verified(font.url,font.sha256));await face.load();document.fonts.add(face);fonts.push(face);}
  const logos=[];try{for(const logo of resources.logos)logos.push(await createImageBitmap(new Blob([await verified(logo.url,logo.sha256)])));}
  catch(error){for(const logo of logos)logo.close();throw error;}
  return {logos,fonts,dispose(){for(const logo of logos)logo.close();for(const font of fonts)document.fonts.delete(font);}};
}
export function renderArtwork(canvas,spec,resources,assets){
  validateSpec(spec,resources);if(assets.logos.length!==3||assets.fonts.some(f=>f.status!=='loaded'))fail('DESIGN_RESOURCE_FAILED');
  canvas.width=canvas.height=1080;const c=canvas.getContext('2d');if(!c)fail('DESIGN_CANVAS_FAILED');
  const report={renderer:RENDERER,size:[1080,1080],texts:[],logos:[]};
  c.fillStyle=spec.paper;c.fillRect(0,0,1080,1080);c.fillStyle='#FFFFFF';c.fillRect(0,0,1080,170);
  const boxes=[[64,26,444,146],[594,32,702,140],[828,24,1008,144]];
  assets.logos.forEach((logo,i)=>{const [x,y,right,bottom]=boxes[i],ratio=Math.min((right-x)/logo.width,(bottom-y)/logo.height),w=logo.width*ratio,h=logo.height*ratio,left=x+(right-x-w)/2,top=y+(bottom-y-h)/2;c.drawImage(logo,left,top,w,h);report.logos.push({file:resources.logos[i].file,bbox:[left,top,left+w,top+h],ratio:logo.width/logo.height});});
  const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const line=(x,y,x2,y2,width=6)=>{c.strokeStyle=spec.accent;c.lineWidth=width;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();};
  const circle=(x,y,r,fill=spec.paper)=>{c.fillStyle=fill;c.strokeStyle=spec.accent;c.lineWidth=8;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.stroke();};
  function text(value,x,y,width,size,family,maxLines,color=spec.ink){
    if(!value.trim())return y;
    c.font=`${size}px ${family}`;c.textBaseline='alphabetic';c.fillStyle=color;
    const words=value.trim().normalize('NFC').split(/\s+/),lines=[];let current='';
    for(const word of words){if(c.measureText(word).width>width)fail('DESIGN_TEXT_OVERFLOW');const trial=current?current+' '+word:word;if(c.measureText(trial).width>width){lines.push(current);current=word;}else current=trial;}if(current)lines.push(current);
    if(lines.length>maxLines)fail('DESIGN_TEXT_OVERFLOW');
    // Balance large headings so a final single word is not stranded on its own line.
    if(family==='ArtworkTitle'&&lines.length>1){
      const target=c.measureText(words.join(' ')).width/lines.length,memo=new Map();
      function split(at,left){const key=at+':'+left;if(memo.has(key))return memo.get(key);if(!left)return at===words.length?{cost:0,lines:[]}:null;let best=null;for(let end=at+1;end<=words.length-left+1;end++){const line=words.slice(at,end).join(' '),w=c.measureText(line).width;if(w>width)break;const next=split(end,left-1);if(next){const cost=(w-target)**2+next.cost;if(!best||cost<best.cost)best={cost,lines:[line,...next.lines]};}}memo.set(key,best);return best;}
      const balanced=split(0,lines.length);if(balanced)lines.splice(0,lines.length,...balanced.lines);
    }
    for(const [i,value] of lines.entries()){const baseline=y+size+i*size*1.22,m=c.measureText(value),bbox=[x-m.actualBoundingBoxLeft,baseline-m.actualBoundingBoxAscent,x+m.actualBoundingBoxRight,baseline+m.actualBoundingBoxDescent];if(bbox[0]<48||bbox[2]>1032||bbox[1]<184||bbox[3]>1048)fail('DESIGN_TEXT_OVERFLOW');c.fillText(value,x,baseline);report.texts.push({text:value,bbox,size,color,background:spec.paper});}
    return y+lines.length*size*1.22;
  }
  rect(64,192,104,8,spec.accent);
  text(spec.headline,64,225,952,60,'ArtworkTitle',3);
  if(spec.layout==='infographic'){
    for(const [i,point] of spec.points.entries()){const y=500+i*140;circle(86,y+30,13,spec.accent);text(point,132,y,880,34,'ArtworkBody',2);}
    text(spec.note,64,970,952,27,'ArtworkBold',2);
  }else{
    if(spec.motif==='network'){
      for(const [x,y] of [[260,590],[820,590],[260,825],[820,825]]){line(540,705,x,y,8);circle(x,y,52);rect(x-16,y-16,32,32,spec.accent);}circle(540,705,84,spec.accent);
      // White pictogram inside the central node, no text or invented numerical claim.
      c.strokeStyle='#FFFFFF';c.lineWidth=5;c.strokeRect(512,677,56,56);rect(528,693,24,24,'#FFFFFF');
      for(const offset of [522,540,558]){c.beginPath();c.moveTo(offset,664);c.lineTo(offset,677);c.moveTo(offset,733);c.lineTo(offset,746);c.stroke();}
    }else if(spec.motif==='process'){
      line(250,705,830,705,10);for(const x of [250,540,830]){circle(x,705,80);line(x-26,705,x-6,725,9);line(x-6,725,x+34,682,9);}
    }else{
      c.strokeStyle=spec.accent;c.lineWidth=8;c.strokeRect(320,505,440,355);rect(360,555,110,95,spec.accent);for(const y of [590,705,790])line(515,y,705,y,12);line(363,716,385,738,8);line(385,738,432,688,8);line(363,796,385,818,8);line(385,818,432,768,8);
    }
    text(spec.note,64,965,952,32,'ArtworkBody',2);
  }
  for(let i=0;i<report.texts.length;i++)for(let j=i+1;j<report.texts.length;j++){const a=report.texts[i].bbox,b=report.texts[j].bbox;if(a[0]<b[2]&&b[0]<a[2]&&a[1]<b[3]&&b[1]<a[3])fail('DESIGN_TEXT_OVERFLOW');}
  return report;
}
export async function pngBlob(canvas){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.type!=='image/png'||blob.size>5*1048576)fail('DESIGN_CANVAS_FAILED');return blob;}
