// Compiled test harness only; no production deployment includes this entrypoint.
import {approvedProductionItems} from '../../src/production/preview.ts';
import {runProductionPublisher} from '../../src/production/publisher-live.ts';
import type {PublisherBindings} from '../../src/production/publisher-live.ts';
import {ProductionMetaPublisher} from '../../src/production/publisher-provider.ts';
import {productionSendPreflight,issueSingleTestPermit,activateSingleTestPermit} from '../../src/production/send-preflight.ts';
import {POLICY} from '../../src/domain/policy.ts';
export default {async fetch(request:Request,env:PublisherBindings){
 try{const p=await request.json() as {at:number;diagnostic?:boolean;dryRunVersion?:string;approve?:any};
 if(p.dryRunVersion)return Response.json(await productionSendPreflight({...env,PRODUCTION_PUBLISHER_ENABLED:'false'},{versionId:p.dryRunVersion},fetch,()=>p.at));
 if(p.approve){const permit=await issueSingleTestPermit(env,p.approve,{actor:POLICY.ownerEmail,dossierHash:p.approve.dossierHash},()=>p.at);return Response.json(await activateSingleTestPermit(env,permit.permitId,POLICY.ownerEmail,()=>p.at));}
 if(p.diagnostic)return Response.json({items:await approvedProductionItems(env,p.at),proof:await new ProductionMetaPublisher(env,fetch).verify(p.at)});return Response.json(await runProductionPublisher(env,new ProductionMetaPublisher(env,fetch),()=>p.at));}
 catch(e){return Response.json({error:e instanceof Error?e.message:'test failure'},{status:500});}
}};
