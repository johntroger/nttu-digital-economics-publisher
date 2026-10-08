// Mock Graph endpoint for F4 network/serialization measurements. No external fetch.
import type {ManagementBindings} from '../../src/production/management.ts';
type Env=ManagementBindings&{CPU_TEST_MODE?:string;CPU_TEST_DATABASE_ID?:string;CPU_TEST_TOKEN?:string};
export async function mockFetch(r:Request,e:Env){
 if(e.CPU_TEST_MODE!=='isolated-f4'||!e.CPU_TEST_DATABASE_ID||['09cdecc7-36a2-4196-950e-ef68b1ecd834','83881fd7-88e6-4835-b616-6f4f8f2d25cd'].includes(e.CPU_TEST_DATABASE_ID)||!e.CPU_TEST_TOKEN||r.headers.get('Authorization')!=='Bearer '+e.CPU_TEST_TOKEN)return Response.json({error:'DENIED'},{status:401});
 const at=Number(r.headers.get('X-F4-Time')),scenario=r.headers.get('X-F4-Scenario'),path=new URL(r.url).pathname;
 if(path==='/v26.0/debug_token')return Response.json({data:{is_valid:true,type:'PAGE',app_id:'1125636386458970',expires_at:Math.floor(at/1000)+86400,data_access_expires_at:0,scopes:['pages_read_engagement','pages_manage_posts']}});
 if(path==='/v26.0/me')return Response.json({id:'817593604765443',name:'Ngành Kinh tế số - NTTU'});
 if(path==='/v26.0/817593604765443/photos'&&r.method==='POST'){
  if(scenario==='unknown')return Response.json({error:{code:4}},{status:503});if(scenario==='retryable')return Response.json({error:{code:4}},{status:429});
  const form=await r.formData();if(form.get('published')!=='true'||typeof form.get('caption')!=='string'||!(form.get('source') instanceof Blob))return Response.json({error:{code:100}},{status:400});
  return Response.json({id:'1234567890123456',post_id:'817593604765443_1234567890123456'});
 }
 if(path==='/v26.0/817593604765443_1234567890123456'&&r.method==='GET'){
  const row=await e.DB!.prepare('SELECT j.caption,t.created_at FROM production_publisher_jobs j JOIN production_publisher_attempts t ON t.job=j.id ORDER BY t.created_at DESC LIMIT 1').first<{caption:string;created_at:number}>();
  return Response.json({id:'817593604765443_1234567890123456',message:scenario==='mismatch'?'mismatch':row?.caption,created_time:new Date(row?.created_at??at).toISOString()});
 }
 return Response.json({error:'UNKNOWN'},{status:404});
}
export default {fetch:mockFetch};
