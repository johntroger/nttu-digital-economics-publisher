import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createLocalServer} from './dev.mjs';
const id=process.argv[2];if(!/^restored-[0-9a-f-]{36}$/.test(id??''))throw new Error('Dùng: node scripts/open-restored.mjs restored-ID');
const root=resolve('tmp/step-10/restores',id),result=JSON.parse(readFileSync(resolve(root,'restore-result.json'),'utf8'));
if(result.id!==id||result.resourcesRoot!=='tmp/step-10/restores/'+id)throw new Error('Restore identity mismatch');
const server=createLocalServer({editor:true,editorOptions:{database:result.database,assetsRoot:result.assetsRoot,resourcesRoot:result.resourcesRoot}});
server.listen(3790,'127.0.0.1',()=>console.log('Kho khôi phục local, chưa bật đăng: http://127.0.0.1:3790/'));server.on('error',error=>{console.error(error.message);process.exitCode=1;});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
