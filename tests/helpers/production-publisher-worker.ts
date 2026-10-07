// Local workerd fixture only. Not an application entrypoint or cloud migration.
import {FakeProductionPublisher,runProductionSimulation} from '../../src/production/publisher-simulation.ts';
import type {CloudBindings} from '../../src/cloud/runtime.ts';
export default {async fetch(request:Request,env:CloudBindings){
 if(env.APP_ENV!=='test'||env.INTEGRATION_MODE!=='fake'||new URL(request.url).origin!=='https://isolated-publisher.invalid')return new Response('',{status:403});
 const input=await request.json() as {at:number;outcome:string;delay?:number};
 const publisher=new FakeProductionPublisher(async r=>{
  if(input.delay)await new Promise(resolve=>setTimeout(resolve,input.delay));
  if(input.outcome==='throw')throw Error('simulated lost response');
  if(input.outcome==='policy'&&r.postId==='p1')return {kind:'policy'};
  if(input.outcome==='retryable'&&r.postId==='p1')return {kind:'retryable'};
  return {kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:input.at};
 });
 try{return Response.json({...await runProductionSimulation(env,{publisher,now:()=>input.at}),fakeCalls:publisher.calls.length});}
 catch{return Response.json({state:'injected_failure',fakeCalls:publisher.calls.length},{status:500});}
}};
