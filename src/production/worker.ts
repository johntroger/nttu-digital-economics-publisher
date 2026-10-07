import type {ManagementBindings} from './management.ts';
import {productionState,managementData,productionFile} from './management.ts';
import {startGoogle,completeGoogle,ownerSession,requireMutation,clearSessionCookie,authConfigured} from '../cloud/auth.ts';
import {productionMetaStatus,verifyProductionMeta} from './meta.ts';
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
 async fetch(request:Request,env:ManagementBindings):Promise<Response>{
  try {
    const url=new URL(request.url);
    if(url.origin!==env.AUTH_ORIGIN)return json({error:'PRODUCTION_ORIGIN_INVALID'},403);
    await productionState(env);
    if(url.pathname==='/health'&&request.method==='GET')return json({environment:'production',phase:'management',release:env.RELEASE_SHA,
      databaseChecked:true,publishingImplemented:false,publishingEnabled:false,schedulerImplemented:false,ownerLoginConfigured:authConfigured(env)});
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
    if(request.method==='POST'&&url.pathname==='/api/meta/check'){
      try{requireMutation(request,env,owner);}catch{return json({error:'CSRF_REQUIRED'},403);}
      const length=Number(request.headers.get('Content-Length'));if(length>1024)return json({error:'META_REQUEST_INVALID'},422);
      const text=await request.text();if(text.length>1024)return json({error:'META_REQUEST_INVALID'},422);
      let input;try{input=JSON.parse(text);}catch{return json({error:'META_REQUEST_INVALID'},422);}
      try{return json(await verifyProductionMeta(env,owner,input));}catch(e){const code=e instanceof Error?e.message:'';return json({error:['META_NOT_CONFIGURED','META_REQUEST_INVALID','REQUEST_REUSED','META_BUSY'].includes(code)?code:'META_CHECK_UNAVAILABLE'},code==='REQUEST_REUSED'?409:422);}
    }
    if(request.method==='GET'&&url.pathname==='/api/management')return json(await managementData(env));
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
};
