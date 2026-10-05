import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {catalogModel,demoModel} from './ui-model.mjs';
import {loadSamplePreviews} from './sample-previews.mjs';
import {EditorError} from '../src/domain/editor.ts';
const files=new Map([
  ['/',[new URL('../ui/index.html',import.meta.url),'text/html; charset=utf-8']],
  ['/ui/app.js',[new URL('../ui/app.js',import.meta.url),'text/javascript; charset=utf-8']],
  ['/ui/backup.js',[new URL('../ui/backup.js',import.meta.url),'text/javascript; charset=utf-8']],
  ['/ui/editor.js',[new URL('../ui/editor.js',import.meta.url),'text/javascript; charset=utf-8']],
  ['/ui/style.css',[new URL('../ui/style.css',import.meta.url),'text/css; charset=utf-8']],
  ['/brand/nttu.png',[new URL('../assets/brand/originals/nttu.png',import.meta.url),'image/png']],
  ['/brand/fba.png',[new URL('../assets/brand/originals/fba.png',import.meta.url),'image/png']],
  ['/brand/digital-economics.jpg',[new URL('../assets/brand/originals/digital-economics.jpg',import.meta.url),'image/jpeg']],
]);
const headers={
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
export async function localUiResponse(incoming,port,editor=null){
  const host=incoming.headers.host;
  if(host!==`127.0.0.1:${port}`&&host!==`localhost:${port}`)return json({code:'LOCAL_HOST_REQUIRED'},403);
  const readResource=relative=>readFileSync(editor?join(editor.backupContext.resourceDirectory,relative):new URL('../'+relative,import.meta.url));
  const path=new URL(incoming.url,'http://127.0.0.1').pathname;
  if(files.has(path)&&incoming.method==='GET'){
    const [file,type]=files.get(path);const brand={'/brand/nttu.png':'nttu.png','/brand/fba.png':'fba.png','/brand/digital-economics.jpg':'digital-economics.jpg'};return new Response(brand[path]?readResource('assets/brand/originals/'+brand[path]):readFileSync(file),{headers:{...headers,'Content-Type':type}});
  }
  if(path==='/local-api/catalog'&&incoming.method==='GET')return json(catalogModel(editor));
  if(editor&&path.startsWith('/local-api/backups')){
    try{
      if(path==='/local-api/backups'&&incoming.method==='GET')return json({backups:editor.backups.list()});
      if(incoming.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
      if(incoming.headers.origin!==`http://${host}`||incoming.headers['x-local-backup']!=='1'||incoming.headers['content-type']!=='application/json')return json({code:'LOCAL_ORIGIN_REQUIRED'},403);
      let body='';for await(const chunk of incoming){body+=chunk;if(Buffer.byteLength(body)>4096)return json({code:'BODY_TOO_LARGE'},413);}
      let input;try{input=JSON.parse(body);}catch{return json({code:'INVALID_JSON'},400);}
      if(!input||typeof input!=='object'||Array.isArray(input))return json({code:'INVALID_BACKUP_REQUEST'},422);
      if(path==='/local-api/backups/create')return json(editor.backups.create());
      if(path==='/local-api/backups/verify')return json(editor.backups.verify(input.id));
      if(path==='/local-api/backups/restore')return json(editor.backups.restore(input));
      return json({code:'NOT_FOUND'},404);
    }catch(error){return json({code:error instanceof EditorError?error.code:'BACKUP_LOCAL_FAILURE'},error instanceof EditorError&&error.code==='BACKUP_NOT_FOUND'?404:422);}
  }
  const editorPost=path.match(/^\/local-api\/editor\/(P(?:0[1-9]|[12][0-9]|30)|R(?:0[1-9]|10))(?:\/(save|restore|render|review|audit))?$/);
  const editorAsset=path.match(/^\/editor-assets\/(asset-[0-9a-f-]{36})\.png$/);
  const sourceFile=path.match(/^\/local-api\/source-files\/(CAREER-(?:0[1-9]|10)|BM(?:03|11|12))\.pdf$/);
  if(editor&&(editorPost||editorAsset||sourceFile||path==='/local-api/sources'||path==='/local-api/warehouse-audit')){
    try{
      if(path==='/local-api/warehouse-audit'&&incoming.method==='GET')return json(editor.warehouseAudit());
      if(path==='/local-api/sources'&&incoming.method==='GET')return json({sources:editor.sourceLibrary.list()});
      if(sourceFile&&incoming.method==='GET')return new Response(editor.sourceLibrary.pdf(sourceFile[1]),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${sourceFile[1]}.pdf"`}});
      if(editorAsset&&incoming.method==='GET')return new Response(editor.readAsset(editorAsset[1]),{headers:{...headers,'Content-Type':'image/png'}});
      if(editorPost&&!editorPost[2]&&incoming.method==='GET')return json(editor.getPost(editorPost[1]));
      if(editorPost&&editorPost[2]&&incoming.method==='POST'){
        if(incoming.headers.origin!==`http://${host}`||incoming.headers['x-local-editor']!=='1'||incoming.headers['content-type']!=='application/json')return json({code:'LOCAL_ORIGIN_REQUIRED'},403);
        let body='';for await(const chunk of incoming){body+=chunk;if(Buffer.byteLength(body)>65536)return json({code:'BODY_TOO_LARGE'},413);}
        let input;try{input=JSON.parse(body);}catch{return json({code:'INVALID_JSON'},400);}
        if(!input||typeof input!=='object'||Array.isArray(input))return json({code:'INVALID_EDITOR_REQUEST'},422);
        return json(await editor[editorPost[2]](editorPost[1],input));
      }
      return json({code:'METHOD_NOT_ALLOWED'},405);
    }catch(error){
      if(error instanceof EditorError)return json({code:error.code},['EDITOR_POST_NOT_FOUND','EDITOR_VERSION_NOT_FOUND','EDITOR_ASSET_NOT_FOUND'].includes(error.code)?404:['EDITOR_CONFLICT','EDITOR_POST_BUSY','EDITOR_MAINTENANCE','EDITOR_REQUEST_REUSED','EDITOR_ASSET_CHANGED'].includes(error.code)?409:422);
      return json({code:'EDITOR_LOCAL_FAILURE'},500);
    }
  }
  if(path==='/local-api/samples'&&incoming.method==='GET'){
    try{return json({samples:loadSamplePreviews(readResource),ready:false});}
    catch{return json({code:'SAMPLE_PREVIEW_NOT_READY'},409);}
  }
  if(/^\/samples\/P(02|04|05|06|08)(-360)?\.png$/.test(path)&&incoming.method==='GET'){
    try{
      loadSamplePreviews(readResource);
      return new Response(readResource('assets/samples/v1/'+path.slice('/samples/'.length)),{headers:{...headers,'Content-Type':'image/png'}});
    }catch{return json({code:'SAMPLE_PREVIEW_NOT_READY'},409);}
  }
  if(path==='/local-api/demo'&&incoming.method==='POST'){
    if(incoming.headers.origin!==`http://${host}`||incoming.headers['x-local-demo']!=='1'||incoming.headers['content-type']!=='application/json')return json({code:'LOCAL_ORIGIN_REQUIRED'},403);
    let body='';for await(const chunk of incoming){body+=chunk;if(Buffer.byteLength(body)>4096)return json({code:'BODY_TOO_LARGE'},413);}
    let input;try{input=JSON.parse(body);}catch{return json({code:'INVALID_JSON'},400);}
    if(!input||typeof input.scenario!=='string'||!['success','reserve','unknown'].includes(input.scenario))return json({code:'INVALID_DEMO'},422);
    return json(await demoModel(input.scenario));
  }
  if(path.startsWith('/local-api/'))return json({code:'NOT_FOUND'},404);
  return null;
}
