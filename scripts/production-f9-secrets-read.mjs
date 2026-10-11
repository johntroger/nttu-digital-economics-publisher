// Metadata only. Never reads secret values or dispatches workflows.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const token=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8'}).stdout.match(/^password=(.+)$/m)?.[1];
if(!token)throw Error('GitHub authentication unavailable');
const base='https://api.github.com/repos/johntroger/nttu-digital-economics-publisher';
const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json'};
async function read(path){const r=await fetch(base+path,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Metadata read failed: '+r.status);return r.json();}
const secrets=await read('/environments/production-runner/secrets?per_page=100');
const repositorySecrets=await read('/actions/secrets?per_page=100');
const variables=await read('/actions/variables?per_page=100');
const result={capturedAt:new Date().toISOString(),environment:'production-runner',secrets:secrets.secrets.map(s=>({name:s.name,updatedAt:s.updated_at})),repositoryMetaSecrets:repositorySecrets.secrets.filter(s=>/^(PRODUCTION_)?META_(APP_SECRET|PAGE_ACCESS_TOKEN)$/.test(s.name)).map(s=>({name:s.name,updatedAt:s.updated_at})),actionsGate:variables.variables.find(v=>v.name==='PRODUCTION_ACTIONS_ENABLED')?.value??null,secretValuesRead:false};
mkdirSync('tmp/step38/f9',{recursive:true});writeFileSync('tmp/step38/f9/secrets-metadata.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
