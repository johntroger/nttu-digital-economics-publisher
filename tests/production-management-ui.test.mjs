import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
class Element{
 constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.events={};this.dataset={};this.classList={toggle(){}};}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
 addEventListener(name,fn){this.events[name]=fn;}setAttribute(){}removeAttribute(){}
 get options(){return this.children;}get text(){return this.textContent+this.children.map(x=>x.text).join(' ');}
 async emit(name){await this.events[name]?.();}
}
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
function harness(respond,summaryOverrides={}){
 const ids=Object.fromEntries(['panel','error','owner','logout','refresh'].map(k=>[k,new Element(k)])),nav=['overview','posts','schedule','history','notifications','connections'].map(view=>Object.assign(new Element('button'),{dataset:{view}})),calls=[];
 const summary={counts:{posts:40,main:30,reserve:10,files:56,publications:0},targetPageUrl:'https://www.facebook.com/NganhKinhTeSoNTTU',...summaryOverrides};
 const context=vm.createContext({document:{hidden:false,createElement:tag=>new Element(tag),querySelector:s=>ids[s.slice(1)],querySelectorAll:()=>nav},AbortController,console,location:{assign(){}},setInterval(){},crypto,Date,fetch:async(path,opts)=>{calls.push(path);const body=path==='/api/me'?{email:'owner',csrf:'fixture'}:path==='/api/management'?structuredClone(summary):await respond(path,opts);return {status:body.httpError?422:200,ok:!body.httpError,json:async()=>body.httpError?{error:body.httpError}:body};}});
 vm.runInContext(readFileSync('ui/production/management.js','utf8'),context);
 const find=(root,predicate)=>[root,...root.children.flatMap(c=>find(c,predicate))].filter(predicate);
 return {ids,nav,calls,find,summary,click:async view=>{await nav.find(n=>n.dataset.view===view).emit('click');await flush();}};
}
test('F6 UI reports enabled state and pauses with owner CSRF before showing success',async()=>{
 let h;
 h=harness(async(path,options)=>{assert.equal(path,'/api/production/pause');assert.equal(options.method,'POST');assert.equal(options.headers['X-CSRF-Token'],'fixture');assert.equal(options.body,'{}');h.summary.paused=true;h.summary.publishingEnabled=false;return {};},{schema:16,publishingEnabled:true,paused:false});
 await flush();assert.match(h.ids.panel.text,/Lịch đăng tự động đã được bật/);
 await h.find(h.ids.panel,e=>e.textContent==='Tạm dừng đăng tự động')[0].emit('click');await flush();
 assert.match(h.ids.panel.text,/Đã tạm dừng/);assert.equal(h.find(h.ids.panel,e=>e.textContent==='Tạm dừng đăng tự động')[0].disabled,true);
});

test('F1 UI initially requests only identity/summary; captions load on opening a post and other tabs stay unloaded',async()=>{
 const h=harness(async path=>path==='/api/management/posts'?{items:[{id:'p1',version_id:'v1',content_key:'P01',caption_title:'Title'}],nextCursor:null,snapshot:'s'}:path==='/api/management/posts/p1'?{version_id:'v1',version:1,content_key:'P01',caption:'approved\n============\nfooter',sourceRefs:[],sourceFiles:[],contentDesignApproved:true}:assert.fail(path));await flush();
 assert.deepEqual(h.calls,['/api/me','/api/management']);assert.match(h.ids.panel.text,/40 bài/);
 await h.click('posts');assert.ok(h.calls.includes('/api/management/posts'));assert.ok(!h.calls.includes('/api/management/posts/p1'));
 const detail=h.find(h.ids.panel,e=>e.tag==='details')[0];detail.open=true;await detail.emit('toggle');assert.match(detail.text,/============/);assert.equal(h.calls.filter(p=>p==='/api/management/posts/p1').length,1);await detail.emit('toggle');assert.equal(h.calls.filter(p=>p==='/api/management/posts/p1').length,1);
 assert.ok(h.calls.every(p=>!p.includes('preview')&&!p.includes('telegram')&&!p.includes('library')));
});
test('F1 UI shows partial preview progress and grants no global success before remaining pages arrive',async()=>{
 let resolveNext;const pending=new Promise(r=>resolveNext=r);
 const page={snapshot:'same',startDate:'2026-10-09',note:'preview only',total:2,main:2,reserve:0,checkedThrough:1,complete:false,nextCursor:'fixture-cursor',items:[{key:'P01',title:'One',pool:'scheduled',versionId:'v1',day:'2026-10-09',approvalValid:true}]};
 const h=harness(async path=>path==='/api/management/schedule'?{items:[]}:path==='/api/production/preview'?page:path.includes('cursor=')?pending:path==='/api/production/preflight'?{schemaReady:false}:assert.fail(path));await flush();await h.click('schedule');
 assert.match(h.ids.panel.text,/Đã kiểm 1\/2/);assert.ok(!h.ids.panel.text.includes('2/2 bài khớp'));
 resolveNext({...page,checkedThrough:2,complete:true,nextCursor:null,items:[{key:'P02',title:'Two',pool:'scheduled',versionId:'v2',day:'2026-10-10',approvalValid:true}]});await flush();assert.match(h.ids.panel.text,/2\/2 bài khớp/);
 assert.ok(!h.calls.some(p=>p.includes('send-preflight')||p.includes('publisher/tick')));
});
test('F1 UI switching tabs prevents a late preview page from replacing the new view',async()=>{
 let resolveNext;const pending=new Promise(r=>resolveNext=r);
 const page={snapshot:'same',startDate:'2026-10-09',total:2,main:2,reserve:0,checkedThrough:1,complete:false,nextCursor:'fixture-cursor',items:[]};
 const h=harness(async path=>path==='/api/management/schedule'?{items:[]}:path==='/api/production/preview'?page:path.includes('cursor=')?pending:assert.fail(path));await flush();await h.click('schedule');await h.click('overview');resolveNext({...page,complete:true,nextCursor:null});await flush();assert.match(h.ids.panel.text,/Chuẩn bị fanpage chính thức/);assert.ok(!h.ids.panel.text.includes('Bản xem trước'));
});
test('F1 UI discards partial approval results when the final snapshot has changed',async()=>{
 const page={snapshot:'same',startDate:'2026-10-09',total:1,main:1,reserve:0,checkedThrough:1,complete:false,nextCursor:'final',items:[{key:'P01',title:'One',pool:'scheduled',versionId:'v1',approvalValid:true}]};
 const h=harness(async path=>path==='/api/management/schedule'?{items:[]}:path==='/api/production/preview'?page:path.includes('cursor=')?{httpError:'READ_SNAPSHOT_CHANGED'}:assert.fail(path));await flush();await h.click('schedule');await flush();assert.match(h.ids.error.text,/Dữ liệu đã đổi/);assert.equal(h.ids.error.hidden,false);assert.ok(!h.ids.panel.text.includes('1/1 bài khớp'));assert.match(h.ids.panel.text,/Đã kiểm 0\/1/);
});

test('F2 UI shows progress but no verified dossier until all four requests finish',async()=>{
 let finish;const pending=new Promise(r=>finish=r),requests=[];
 const page={snapshot:'same',startDate:'2026-10-09',total:1,main:1,reserve:0,checkedThrough:1,complete:true,nextCursor:null,items:[{key:'P01',title:'One',pool:'scheduled',versionId:'v1',approvalValid:true}]};
 const h=harness(async(path,opts)=>{
  if(path==='/api/management/schedule')return {items:[]};if(path==='/api/production/preview')return page;if(path==='/api/production/preflight')return {schemaReady:false};
  if(path.startsWith('/api/production/send-preflight/')){requests.push(JSON.parse(opts.body));const step=requests.length-1;assert.equal(path.split('/').at(-1),['content','image','connection','finalize'][step]);return step===3?pending:{phase:['content','image','connection'][step],complete:false,nextReceipt:'receipt-'+step,preparationVerified:false};}assert.fail(path);
 });await flush();await h.click('schedule');
 h.find(h.ids.panel,e=>e.tag==='select')[0].value='v1';const checking=h.find(h.ids.panel,e=>e.textContent==='Kiểm tra chuẩn bị gửi')[0].emit('click');await flush();
 assert.match(h.ids.panel.text,/Đang đối chiếu/);assert.ok(!h.ids.panel.text.includes('Chuẩn bị đã kiểm tra'));assert.equal(h.find(h.ids.panel,e=>e.textContent==='Kiểm tra chuẩn bị gửi')[0].disabled,true);
 finish({phase:'finalize',complete:true,preparationVerified:true,nextReceipt:null,note:'read only',dossierHash:'digest',dossier:{versionId:'v1',key:'P01',title:'One',pageName:'NTTU',pageId:'817593604765443',dueAt:1,reviewExpiresAt:2,caption:'approved\n============\nfooter',imageUrl:'/fixture.png'}});await checking;await flush();
 assert.match(h.ids.panel.text,/Chuẩn bị đã kiểm tra · chưa được phép đăng/);assert.deepEqual(requests,[{versionId:'v1'},{receipt:'receipt-0'},{receipt:'receipt-1'},{receipt:'receipt-2'}]);
});

test('F2 UI clears failed preparation and ignores late responses after switching tabs',async()=>{
 for(const changeView of [false,true]){let finish;const pending=new Promise(r=>finish=r);
 const page={snapshot:'same',startDate:'2026-10-09',total:1,main:1,reserve:0,checkedThrough:1,complete:true,nextCursor:null,items:[{key:'P01',title:'One',pool:'scheduled',versionId:'v1',approvalValid:true}]};
 const h=harness(async path=>path==='/api/management/schedule'?{items:[]}:path==='/api/production/preview'?page:path==='/api/production/preflight'?{schemaReady:false}:path.startsWith('/api/production/send-preflight/')?pending:assert.fail(path));await flush();await h.click('schedule');h.find(h.ids.panel,e=>e.tag==='select')[0].value='v1';const checking=h.find(h.ids.panel,e=>e.textContent==='Kiểm tra chuẩn bị gửi')[0].emit('click');await flush();
 if(changeView)await h.click('overview');finish({httpError:'SEND_REVIEW_CHANGED'});await checking;await flush();assert.ok(!h.ids.panel.text.includes('Chuẩn bị đã kiểm tra'));
 if(changeView){assert.match(h.ids.panel.text,/Chuẩn bị fanpage chính thức/);assert.equal(h.ids.error.hidden,true);}else{assert.match(h.ids.error.text,/SEND_REVIEW_CHANGED/);assert.equal(h.find(h.ids.panel,e=>e.textContent==='Kiểm tra chuẩn bị gửi')[0].disabled,false);}
 }
});
