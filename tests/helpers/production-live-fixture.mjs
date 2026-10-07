import {deflateSync} from 'node:zlib';
import {readFileSync,existsSync} from 'node:fs';
import {productionWarehouseFixture} from './production-warehouse-fixture.mjs';
import {approvedProductionItems} from '../../src/production/preview.ts';
import {ProductionMetaPublisher} from '../../src/production/publisher-provider.ts';
import {metaFingerprint} from '../../src/cloud/meta.ts';
export const LIVE_TEST_TIME=Date.parse('2026-10-08T03:00:00Z');
export async function liveFixture({open=false,outcome='confirmed',hook,post='P01'}={}){
 const realImages=!process.env.CI&&existsSync('assets/batch/v1/P01.png');
 const synthetic=realImages?null:new Map(Array.from({length:40},(_,i)=>[(i<30?'P':'R')+String(i<30?i+1:i-29).padStart(2,'0'),testPng(i)]));
 const f=productionWarehouseFixture(realImages?{realImages:true}:{testImageBytes:synthetic}),db=f.db,calls=[];let at=LIVE_TEST_TIME,queries=0;
 const env={...f.env,META_APP_ID:'1125636386458970',META_APP_SECRET:'fixture-secret-'+ 's'.repeat(30),META_PAGE_ACCESS_TOKEN:'fixture-token-'+ 't'.repeat(60),META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',PRODUCTION_PUBLISHER_ENABLED:open?'true':'false',DB:{
  prepare(sql){queries++;let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);},execute(){const s=db.prepare(sql);return s.columns().length?{results:s.all(...args)}:s.run(...args);}};},
  async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.execute());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
 },MEDIA:{async get(key){const p=f.approved.find(p=>'private/'+p.id===key);if(!p)return null;const b=realImages?readFileSync(p.entry.image_path):synthetic.get(p.id);return {size:b.length,async arrayBuffer(){return new Uint8Array(b).buffer;}};}}};
 const item=(await approvedProductionItems(env,at)).find(i=>i.key===post);
 const remote='817593604765443_1234567890123456';
 const transport=async(input,init)=>{
  const url=new URL(String(input));calls.push({path:url.pathname,method:init.method});
  await hook?.(url,init,{db,env});
  if(url.pathname.endsWith('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',app_id:env.META_APP_ID,expires_at:Math.floor(at/1000)+86400,data_access_expires_at:0,scopes:['pages_manage_posts','pages_read_engagement']}});
  if(url.pathname.endsWith('/me'))return Response.json({id:env.META_PAGE_ID,name:'Ngành Kinh tế số - NTTU'});
  if(init.method==='POST'){
   if(outcome==='throw')throw Error('lost response');
   if(outcome==='retryable')return Response.json({error:{code:4}},{status:429});
   if(outcome==='policy')return Response.json({error:{code:100}},{status:400});
   if(outcome==='5xx')return Response.json({error:{code:4}},{status:503});
   return Response.json({id:'1234567890123456',post_id:remote});
  }
  return Response.json({id:remote,message:outcome==='mismatch'?'different':item.caption,created_time:new Date(at).toISOString()});
 };
 if(open){db.prepare("UPDATE production_publisher_config SET enabled=1,start_date='2026-10-08',connection_hash=?").run(await metaFingerprint(env));db.exec("UPDATE application_state SET paused_by_user=0 WHERE environment='production'");
  db.prepare('INSERT INTO production_send_permits(id,page_id,version_id,caption,checksum,business_date,due_at,expires_at,actor,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('fixture-only-explicit-permit',env.META_PAGE_ID,item.versionId,item.caption,item.imageChecksum,'2026-10-08',at,at+86400000,'tranthanhtung37@gmail.com',at-1000);
 }
 return {...f,imageMode:realImages?'actual approved local images':'synthetic CI fixture receipts only',imageBytes:new Map(f.approved.map(p=>[p.id,realImages?readFileSync(p.entry.image_path):synthetic.get(p.id)])),env,item,calls,provider:new ProductionMetaPublisher(env,transport),now:()=>at,setTime:n=>at=n,queryCount:()=>queries,remote};
}

function testPng(color){
 const crc=b=>{let c=0xffffffff;for(const byte of b){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const kind=Buffer.from(name),size=Buffer.alloc(4),end=Buffer.alloc(4);size.writeUInt32BE(data.length);end.writeUInt32BE(crc(Buffer.concat([kind,data])));return Buffer.concat([size,kind,data,end]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(1080,0);header.writeUInt32BE(1080,4);header[8]=8;header[9]=6;const raw=Buffer.alloc(1080*(1080*4+1));for(let y=0;y<1080;y++)for(let x=0;x<1080;x++){const at=y*(4321)+1+x*4;raw[at]=color;raw[at+3]=255;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

