import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EditorError,validateEditorReferences} from '../src/domain/editor.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(resolve(root,path));
const hash=data=>createHash('sha256').update(data).digest('hex');
const fail=code=>{throw new EditorError(code);};
export function createSourceLibrary(readFile=read){
  function registry(){
    const career=JSON.parse(readFile('assets/sources/career/manifest.json')),program=JSON.parse(readFile('assets/sources/program/manifest.json'));
    const rows=[...career.map(s=>({...s,path:s.project_path})),...program];
    const owner=JSON.parse(readFile('content/samples-2026-v1.manifest.json')).registry['OWNER-2026'];
    const map=new Map();
    for(const s of rows){
      const rel=relative(resolve(root,'assets/sources'),resolve(root,s.path));
      if(!s.path||!rel||rel.startsWith('..')||isAbsolute(rel)||!s.path.endsWith('.pdf')||!Number.isSafeInteger(s.pages)||s.pages<1||!/^([a-f0-9]{64})$/.test(s.sha256)||map.has(s.id))fail('EDITOR_SOURCE_REGISTRY_INVALID');
      map.set(s.id,{id:s.id,name:s.name??s.path.split('/').at(-1),path:s.path,pages:s.pages,sha256:s.sha256,authority:'document'});
    }
    map.set('OWNER-2026',{id:'OWNER-2026',name:'Xác nhận khóa 2026 — thời gian đào tạo 3,5 năm',path:null,pages:0,sha256:owner.sha256,authority:'user_confirmation'});
    return map;
  }
  function available(source){try{return !source.path||hash(readFile(source.path))===source.sha256;}catch{return false;}}
  function list(){return [...registry().values()].map(s=>({id:s.id,name:s.name,pages:s.pages,authority:s.authority,available:available(s),pdfUrl:s.path?'/local-api/source-files/'+s.id+'.pdf':null}));}
  function resolveRefs(input){
    const refs=validateEditorReferences(input),sources=registry();
    return refs.map(ref=>{
      const s=sources.get(ref.id);if(!s)fail('EDITOR_SOURCE_NOT_FOUND');
      if(s.authority==='document'&&(!ref.pages.length||ref.pages.some(p=>p>s.pages)))fail('EDITOR_SOURCE_PAGE_INVALID');
      if(s.authority==='user_confirmation'&&ref.pages.length)fail('EDITOR_SOURCE_PAGE_INVALID');
      if(!available(s))fail('EDITOR_SOURCE_CHANGED');
      return {...ref,title:s.name,revision:s.sha256,authority:s.authority};
    });
  }
  function pdf(id){const s=registry().get(id);if(!s?.path)fail('EDITOR_SOURCE_NOT_FOUND');let buffer;try{buffer=readFile(s.path);}catch{fail('EDITOR_SOURCE_CHANGED');}if(hash(buffer)!==s.sha256)fail('EDITOR_SOURCE_CHANGED');return buffer;}
  return {list,resolveRefs,pdf};
}
