// Compiled native-D1 simulation harness, never a deployment entrypoint.
import {runnerAPI} from '../../src/production/runner-api.ts';
import type {RunnerBindings} from '../../src/production/runner-api.ts';
type Env=RunnerBindings&{RUNNER_SIMULATION_MODE?:string;RUNNER_SIMULATION_TIME?:string};
export default {fetch(request:Request,env:Env){
 if(env.RUNNER_SIMULATION_MODE!=='local-only')return Response.json({error:'ISOLATION_REQUIRED'},{status:403});
 return runnerAPI(request,env,()=>Number(env.RUNNER_SIMULATION_TIME),error=>console.error('F5_LOCAL_FAILURE',error instanceof Error?error.message:'unknown'));
}};
