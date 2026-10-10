// Dedicated entrypoint: no UI assets, Google login or scheduled handler.
import {runnerAPI} from './runner-api.ts';
import type {RunnerBindings} from './runner-api.ts';
import {RUNNER_ORIGIN} from './runner-boundary.ts';
export default {
 fetch(request:Request,env:RunnerBindings){
  const url=new URL(request.url);
  if(env.RUNNER_ORIGIN!==RUNNER_ORIGIN||url.origin!==RUNNER_ORIGIN)
   return Promise.resolve(Response.json({error:'RUNNER_ORIGIN_INVALID'},{status:403}));
  if(!/^\/runner\/(claim|data|image|proof|intent|authorize|evidence|finalize|status|heartbeat|watchdog|stock-start|stock-data|stock-finalize)$/.test(url.pathname))
   return Promise.resolve(Response.json({error:'RUNNER_ROUTE_INVALID'},{status:404}));
  return runnerAPI(request,env);
 }
};
