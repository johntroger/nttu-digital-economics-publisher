import {publisherPreflight,publisherAuthorized,runProductionPublisher} from './publisher-live.ts';
import type {PublisherBindings} from './publisher-live.ts';
import {ProductionMetaPublisher} from './publisher-provider.ts';
import {productionSendPreflight} from './send-preflight.ts';
import type {ManagementBindings} from './management.ts';
import {productionState,managementSummary,managementPostPage,managementPostDetail,managementSection,productionFile} from './management.ts';
import {productionPreviewPage} from './preview.ts';
import {startGoogle,completeGoogle,ownerSession,requireMutation,clearSessionCookie,authConfigured} from '../cloud/auth.ts';
import {productionMetaStatus,verifyProductionMeta} from './meta.ts';
import {operationsStatus,enqueueProductionTelegramTest,runProductionOperations,monitorAuthorized,productionMonitorStatus,triggerAuthorized,runProductionHttpTick} from './operations.ts';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
function json(body:unknown,status=200){return Response.json(body,{status,headers});}
function login(env:ManagementBindings,url:URL) {
  const messages:Record<string,string>={owner:'Hãy dùng tài khoản Google của người quản lý.',client:'Cần kiểm tra Client ID và Client Secret của production.',grant:'Phiên đăng nhập đã hết hạn. Hãy thử lại.',flow:'Phiên đăng nhập không hợp lệ. Hãy thử lại.'};
  const configured=authConfigured(env),failed=url.searchParams.get('login')==='failed';
  const message=failed?(messages[url.searchParams.get('reason')??'']??'Chưa hoàn tất đăng nhập Google. Hãy thử lại.')
    :configured?'Đăng nhập bằng tài khoản Google của người quản lý.':'Đang thiết lập đăng nhập Google cho môi trường chính thức.';
  return new Response(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phòng nội dung · NTTU</title><link rel="stylesheet" href="/management.css"><main class="login"><p class="brand">Ngành Kinh tế số · NTTU</p><h1>Phòng nội dung</h1><p class="environment">Môi trường chính thức</p><p>${message}</p>${configured?'<a class="button" href="/auth/google/start">Đăng nhập bằng Google</a>':''}<p class="note">Chưa bật đăng bài tự động.</p></main></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
export default {
 async fetch(request:Request,env:PublisherBindings):Promise<Response>{
  try {
    const url=new URL(request.url);
    if(url.origin!==env.AUTH_ORIGIN)return json({error:'PRODUCTION_ORIGIN_INVALID'},403);
    if(url.pathname==='/api/production/publisher/tick'){
      if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
      if(url.search||!await publisherAuthorized(request,env))return json({error:'PUBLISHER_AUTH_REQUIRED'},401);
      if(await request.text()!=='')return json({error:'PUBLISHER_BODY_NOT_ALLOWED'},422);
      return json(await runProductionPublisher(env,new ProductionMetaPublisher(env,fetch)));
    }
    // F1 read functions validate database identity themselves before reading content.
    // Keep the outer guard for all other routes; do not repeat the same D1 read.
    const guardedRead=request.method==='GET'&&(url.pathname==='/api/production/preview'||url.pathname==='/api/management'||url.pathname.startsWith('/api/management/'));
    if(!guardedRead)await productionState(env);
    if(url.pathname==='/api/production/tick'){
      if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
      if(url.search||!await triggerAuthorized(request,env))return json({error:'TRIGGER_AUTH_REQUIRED'},401);
      // No caller-selected time, recipient, payload or operation is accepted.
      if(await request.text()!=='')return json({error:'TRIGGER_BODY_NOT_ALLOWED'},422);
      try{return json(await runProductionHttpTick(env));}catch{return json({error:'TRIGGER_UNAVAILABLE'},503);}
    }
    if(url.pathname==='/health'&&request.method==='GET')return json({environment:'production',phase:'management',release:env.RELEASE_SHA,
      databaseChecked:true,publisherAdapterImplemented:true,publishingImplemented:false,publishingEnabled:false,schedulerImplemented:false,operationsSchedulerImplemented:true,ownerLoginConfigured:authConfigured(env)});
    if(url.pathname==='/api/production/monitor'&&request.method==='GET'){
      if(!await monitorAuthorized(request,env))return json({error:'MONITOR_AUTH_REQUIRED'},401);
      return json(await productionMonitorStatus(env));
    }
    if(request.method==='GET'&&url.pathname==='/auth/google/start'){
      if(!authConfigured(env))return json({error:'GOOGLE_NOT_CONFIGURED'},503);
      return await startGoogle(request,env);
    }
    if(request.method==='GET'&&url.pathname==='/auth/google/callback'){
      if(!authConfigured(env))return json({error:'GOOGLE_NOT_CONFIGURED'},503);
      return await completeGoogle(request,env);
    }
    // Only CSS/font assets are public; no content or documents are in this directory.
    if(request.method==='GET'&&(url.pathname==='/management.css'||/^\/fonts\/WorkSans-(Regular|Bold)\.ttf$/.test(url.pathname)))
      return env.ASSETS?env.ASSETS.fetch(request):json({error:'ASSETS_UNAVAILABLE'},503);
    const owner=await ownerSession(request,env);
    if(!owner){if(url.pathname==='/'&&request.method==='GET')return login(env,url);return json({error:'OWNER_LOGIN_REQUIRED'},401);}
    if(url.pathname==='/auth/logout'&&request.method==='POST'){
      try{requireMutation(request,env,owner);}catch{return json({error:'CSRF_REQUIRED'},403);}
      return Response.json({loggedOut:true},{headers:{...headers,'Set-Cookie':clearSessionCookie()}});
    }
    if(request.method==='GET'&&url.pathname==='/api/me')return json({email:owner.email,csrf:owner.csrf,environment:'production'});
    if(request.method==='GET'&&url.pathname==='/api/meta')return json(await productionMetaStatus(env));
    if(request.method==='GET'&&url.pathname==='/api/telegram')return json(await operationsStatus(env));
    if(request.method==='POST'&&url.pathname==='/api/telegram/test'){
      try{requireMutation(request,env,owner);}catch{return json({error:'CSRF_REQUIRED'},403);}
      const body=await request.text();if(body.length>1024)return json({error:'TELEGRAM_REQUEST_INVALID'},422);
      try{return json(await enqueueProductionTelegramTest(env,JSON.parse(body)));}catch{return json({error:'TELEGRAM_TEST_UNAVAILABLE'},422);}
    }
    if(request.method==='POST'&&url.pathname==='/api/meta/check'){
      try{requireMutation(request,env,owner);}catch{return json({error:'CSRF_REQUIRED'},403);}
      const length=Number(request.headers.get('Content-Length'));if(length>1024)return json({error:'META_REQUEST_INVALID'},422);
      const text=await request.text();if(text.length>1024)return json({error:'META_REQUEST_INVALID'},422);
      let input;try{input=JSON.parse(text);}catch{return json({error:'META_REQUEST_INVALID'},422);}
      try{return json(await verifyProductionMeta(env,owner,input));}catch(e){const code=e instanceof Error?e.message:'';return json({error:['META_NOT_CONFIGURED','META_REQUEST_INVALID','REQUEST_REUSED','META_BUSY'].includes(code)?code:'META_CHECK_UNAVAILABLE'},code==='REQUEST_REUSED'?409:422);}
    }
    if(url.pathname==='/api/management'||url.pathname.startsWith('/api/management/')){
      if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
      try{
        if(url.pathname==='/api/management'&&!url.search)return json(await managementSummary(env));
        if(url.pathname==='/api/management/posts'&&[...url.searchParams.keys()].every(k=>k==='cursor')&&url.searchParams.getAll('cursor').length<=1)return json(await managementPostPage(env,url.searchParams.get('cursor')??undefined));
        const encoded=url.pathname.match(/^\/api\/management\/posts\/([^/]{1,384})$/)?.[1];
        const id=encoded?decodeURIComponent(encoded):undefined;
        if(id&&/^[a-zA-Z0-9:-]{1,128}$/.test(id)&&!url.search)return json(await managementPostDetail(env,id));
        if(['/api/management/library','/api/management/history','/api/management/schedule'].includes(url.pathname)&&!url.search)return json(await managementSection(env,url.pathname.split('/').at(-1)!));
        return json({error:'READ_REQUEST_INVALID'},422);
      }catch(e){const code=e instanceof Error?e.message:'';if(code.startsWith('PRODUCTION_'))throw e;return json({error:/^READ_/.test(code)?code:'READ_UNAVAILABLE'},code==='READ_POST_NOT_FOUND'?404:422);}
    }
    if(url.pathname==='/api/production/send-preflight'){
      if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
      try{requireMutation(request,env,owner);}catch{return json({error:'CSRF_REQUIRED'},403);}
      if(url.search||Number(request.headers.get('Content-Length'))>1024)return json({error:'SEND_REVIEW_INVALID'},422);
      const text=await request.text();if(text.length>1024)return json({error:'SEND_REVIEW_INVALID'},422);
      let input;try{input=JSON.parse(text);}catch{return json({error:'SEND_REVIEW_INVALID'},422);}
      try{return json(await productionSendPreflight(env,input,fetch));}
      catch(e){const code=e instanceof Error?e.message:'';return json({error:/^(SEND_|PREFLIGHT_|FILE_)/.test(code)?code:'SEND_PREFLIGHT_UNAVAILABLE'},422);}
    }
    if(url.pathname==='/api/production/preflight'){
      if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
      if(url.search)return json({error:'PREFLIGHT_QUERY_NOT_ALLOWED'},422);
      return json(await publisherPreflight(env));
    }
    if(url.pathname==='/api/production/preview'){
      if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
      if([...url.searchParams.keys()].some(k=>!['startDate','cursor'].includes(k))||url.searchParams.getAll('startDate').length>1||url.searchParams.getAll('cursor').length>1)return json({error:'PREVIEW_DATE_INVALID'},422);
      try{return json(await productionPreviewPage(env,{startDate:url.searchParams.get('startDate')??undefined,cursor:url.searchParams.get('cursor')??undefined}));}
      catch(e){if(e instanceof Error&&(e.message==='PREVIEW_DATE_INVALID'||e.message.startsWith('READ_')))return json({error:e.message},422);throw e;}
    }
    if(request.method==='GET'&&/^\/api\/library\/files\/[a-zA-Z0-9-]{1,128}$/.test(url.pathname))return await productionFile(env,url.pathname.split('/').at(-1)!);
    if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/management.js')) {
      if(!env.ASSETS)return json({error:'ASSETS_UNAVAILABLE'},503);
      const asset=new URL(url.pathname==='/'?'/manager.html':url.pathname,url.origin);
      const response=await env.ASSETS.fetch(new Request(asset));
      const result=new Response(response.body,response);for(const [k,v] of Object.entries(headers))result.headers.set(k,v);
      result.headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'");return result;
    }
    return json({error:'PRODUCTION_ROUTE_NOT_AVAILABLE'},404);
  } catch { return json({error:'PRODUCTION_MANAGEMENT_UNAVAILABLE'},503); }
 },
 async scheduled(event:{cron:string;scheduledTime:number},env:ManagementBindings){await runProductionOperations(event,env);},
};
