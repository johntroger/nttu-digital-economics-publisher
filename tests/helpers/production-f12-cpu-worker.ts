// Disposable measurement harness. The production entrypoint remains unchanged.
import worker from '../../src/production/worker.ts';
import type {ManagementBindings} from '../../src/production/management.ts';
type Env=ManagementBindings&{CPU_TEST_MODE?:string;CPU_TEST_NAME?:string;CPU_TEST_DATABASE_ID?:string;CPU_TEST_TOKEN?:string};
let cold=true;
export default {async fetch(request:Request,e:Env){
 const u=new URL(request.url),name=e.CPU_TEST_NAME;
 if(e.CPU_TEST_MODE!=='private-f12'||!/^nttu-f12-cpu-[a-f0-9]{10}$/.test(name??'')||u.origin!=='https://'+name+'.nttu-kts-johntroger.workers.dev'||! /^[a-f0-9-]{36}$/.test(e.CPU_TEST_DATABASE_ID??'')||['09cdecc7-36a2-4196-950e-ef68b1ecd834','83881fd7-88e6-4835-b616-6f4f8f2d25cd'].includes(e.CPU_TEST_DATABASE_ID!)||! /^[a-f0-9]{64}$/.test(e.CPU_TEST_TOKEN??''))return Response.json({error:'F12_ISOLATION_REQUIRED'},{status:403});
 if(u.pathname!=='/api/production/monitor'||u.search||request.method!=='GET'||request.headers.get('Authorization')!=='Bearer '+e.CPU_TEST_TOKEN)return Response.json({error:'F12_AUTH_REQUIRED'},{status:401});
 console.log('F12_OBSERVATION',JSON.stringify({cold,path:u.pathname}));cold=false;
 return worker.fetch(request,{...e,AUTH_ORIGIN:u.origin,PRODUCTION_MONITOR_TOKEN:e.CPU_TEST_TOKEN,
  PRODUCTION_PUBLISHER_ENABLED:'false',PRODUCTION_RUNNER_ENABLED:'false',DAILY_PUBLISHING_ENABLED:'false',
  META_APP_SECRET:'s'.repeat(4096),META_PAGE_ACCESS_TOKEN:'t'.repeat(4096)});
}};
