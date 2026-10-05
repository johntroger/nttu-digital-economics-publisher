import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import worker from '../src/worker.ts';
import {localUiResponse} from './ui-handler.mjs';
import {createBackupService} from './backup-service.mjs';
import {createEditorService} from './editor-service.mjs';

export function createLocalServer({editor=false,editorOptions={},backupOptions={}}={}) {
  const editorService=editor?createEditorService(editorOptions):null;
  if(editorService)editorService.backups=createBackupService(editorService,backupOptions);
  const server=createServer(async (incoming, outgoing) => {
    try {
      const uiResponse=await localUiResponse(incoming,server.address().port,editorService);
      if(uiResponse){outgoing.writeHead(uiResponse.status,Object.fromEntries(uiResponse.headers));outgoing.end(Buffer.from(await uiResponse.arrayBuffer()));return;}
      incoming.resume();
      const request = new Request(new URL(incoming.url ?? '/', 'http://127.0.0.1'), {
        method: incoming.method ?? 'GET',
      });
      const response = await worker.fetch(request, { APP_ENV: 'local', INTEGRATION_MODE: 'fake' });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify({ code: 'LOCAL_SERVER_ERROR' }));
    }
  });
  if(editorService)server.on('close',()=>editorService.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3789);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port');
  const server = createLocalServer({editor:true,editorOptions:{database:process.env.LOCAL_EDITOR_DATABASE??'tmp/step-08/warehouse.sqlite',assetsRoot:process.env.LOCAL_EDITOR_ASSETS??'tmp/step-08/assets',resourcesRoot:process.env.LOCAL_EDITOR_RESOURCES??null}});
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Giao diện local, chưa kết nối fanpage thật: http://127.0.0.1:${port}/\n`);
  });
  server.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
