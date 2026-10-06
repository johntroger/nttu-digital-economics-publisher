// Browser QA uses an isolated loopback harness and fixture session, never real Google credentials.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync,readFileSync } from 'node:fs';
import {uploadFile} from '../src/cloud/storage.ts';
import {DESIGN_REGISTRY} from '../src/cloud/design-registry.ts';
import {spawnSync} from 'node:child_process';
import {restoreCloudBundle} from './cloud-backup-restore.mjs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import { managementFixture } from './cloud-management-smoke.mjs';
import worker from '../src/cloud/worker.ts';
import { png, pdf } from '../tests/helpers/files.mjs';
import {createSourceLibrary} from './source-library.mjs';
const { chromium } = createRequire(`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`)('playwright');
const f = await managementFixture(), fixtureId = crypto.randomUUID();
let base;
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const headers = new Headers(); for (const [name,value] of Object.entries(incoming.headers)) if (value && name !== 'host') headers.set(name, String(value));
    if (headers.get('Cookie') === 'local_fixture=' + fixtureId) headers.set('Cookie',f.cookie);
    if (headers.get('Origin') === base) headers.set('Origin', f.origin);
    const response = await worker.fetch(new Request(f.origin+incoming.url,{method:incoming.method,headers,
      ...(['GET','HEAD'].includes(incoming.method) ? {} : {body:Buffer.concat(chunks)})}),f.env);
    outgoing.writeHead(response.status,Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Local test harness failed'); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); base='http://127.0.0.1:'+server.address().port;
mkdirSync('tmp/step-15',{recursive:true});
const headedPDF=process.env.PDF_VIEWER_QA==='true';
const browser=await chromium.launch({headless:!headedPDF,args:headedPDF?['--window-position=-32000,-32000']:[],executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],results=[];
page.on('pageerror',error=>errors.push(error.message));
const check=async(name,fn)=>{await fn();results.push(name);};
const originalFetch=globalThis.fetch;let telegramMode='blocked';
globalThis.fetch=async(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;if(!url.startsWith('https://api.telegram.org/'))return originalFetch(input,init);if(url.endsWith('/getUpdates'))return Response.json({ok:true,result:[{message:{text:'/start',chat:{id:12345678,type:'private'}}}]});if(telegramMode==='blocked')return Response.json({ok:false},{status:403});return Response.json({ok:true,result:{message_id:41,chat:{id:12345678,type:'private'}}});};
try {
  await check('anonymous sees login and cannot download management scripts',async()=>{
    await page.goto(base); assert.equal(await page.locator('h1').textContent(),'Phòng nội dung');
    assert.equal((await page.request.get(base+'/manager.js')).status(),401);
  });
  await context.addCookies([{name:'local_fixture',value:fixtureId,url:base,httpOnly:true,sameSite:'Lax'}]);
  await page.goto(base); await page.waitForFunction(()=>document.getElementById('total')?.textContent==='40');
  await check('owner loads 40 isolated briefs and no ready images',async()=>{assert.equal(await page.locator('.post-button').count(),40);assert.match(await page.locator('#account').textContent(),/tranthanhtung37/);});
  await page.locator('.post-button').first().click(); await page.locator('#edit-form').waitFor();
  const original=await page.locator('#body').inputValue();
  await check('caption preview keeps separator footer and safe text',async()=>{
    await page.locator('#body').fill('Kỹ năng thực hành: <img src=x onerror=alert(1)> phân tích dữ liệu.');
    assert.match(await page.locator('#caption-preview').textContent(),/============/);
    assert.equal(await page.locator('#caption-preview img').count(),0);
  });
  await check('save creates version 2 and restores old caption as version 3',async()=>{
    await page.locator('#edit-form button[type=submit]').click();
    await page.waitForFunction(()=>document.getElementById('version-label').textContent==='Phiên bản 2');
    await page.getByText('Các phiên bản đã lưu',{exact:true}).click();
    page.once('dialog',dialog=>dialog.accept()); await page.getByRole('button',{name:'Khôi phục thành bản mới'}).click();
    await page.waitForFunction(()=>document.getElementById('version-label').textContent==='Phiên bản 3');
    assert.equal(await page.locator('#body').inputValue(),original);
  });
  await check('library uploads private PDF and logo, and reuses identical file',async()=>{
    await page.locator('[data-view=library]').click();
    await page.locator('#file-input').setInputFiles({name:'Nguồn thử.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)});
    await page.locator('#file-source').fill('FIXTURE');
    await page.locator('#upload-file').click();await page.waitForFunction(()=>document.querySelectorAll('.file-row').length===1);
    await page.locator('#upload-file').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('đã có'));
    assert.equal(await page.locator('.file-row').count(),1);
    const link=await page.getByRole('link',{name:'Tải PDF'}).getAttribute('href');
    const response=await page.request.get(base+link);assert.equal(response.status(),200);assert.deepEqual(await response.body(),Buffer.from(pdf));
    assert.equal((await fetch(base+link)).status,401);
    await page.locator('#file-kind').selectOption('logo');assert.equal(await page.locator('#file-source').isDisabled(),true);
    await page.locator('#file-input').setInputFiles({name:'Logo thử.png',mimeType:'image/png',buffer:Buffer.from(png(100,100))});
    await page.locator('#upload-file').click();await page.waitForFunction(()=>document.querySelectorAll('.file-row').length===2);
  });
  await check('library rejects wrong square size and uploads full square image',async()=>{
    await page.locator('#file-kind').selectOption('image');
    await page.locator('#file-input').setInputFiles({name:'Nhỏ.png',mimeType:'image/png',buffer:Buffer.from(png(360,360))});
    await page.locator('#upload-file').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('1080'));
    assert.equal(await page.locator('.file-row').count(),2);
    await page.locator('#file-input').setInputFiles({name:'Ảnh bài thử.png',mimeType:'image/png',buffer:Buffer.from(png())});
    await page.locator('#upload-file').click();await page.waitForFunction(()=>document.querySelectorAll('.file-row').length===3);
    await page.screenshot({path:'tmp/step-15/library-desktop.png',fullPage:true});
  });
  await check('attachment preserves caption and creates reviewed-needed version with visible image',async()=>{
    await page.locator('[data-view=posts]').click();await page.locator('#attach-image').click();
    await page.waitForFunction(()=>document.getElementById('version-label').textContent==='Phiên bản 4');
    assert.equal(await page.locator('#body').inputValue(),original);
    await page.waitForFunction(()=>document.getElementById('post-image').naturalWidth===1080);
    assert.match(await page.locator('#image-status').textContent(),/cần rà soát/);
    await page.screenshot({path:'tmp/step-15/cloud-desktop.png',fullPage:true});
  });
  await check('search and navigation work without fabricated history',async()=>{
    await page.locator('#search').fill('khong-co-bai-fixture'); assert.equal(await page.locator('.post-button').count(),0);
    await page.locator('#search').fill('');
    await page.locator('[data-view=history]').click();assert.match(await page.locator('#other-content').textContent(),/Chưa có bài đăng Facebook thật/);
    await page.locator('[data-view=posts]').click();
  });
  await check('mobile has no horizontal overflow and keyboard focus is visible',async()=>{
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#search').focus();await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'group');
    assert.notEqual(await page.locator('#group').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
    await page.screenshot({path:'tmp/step-15/cloud-mobile.png',fullPage:true});
    await page.locator('[data-view=library]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'tmp/step-15/library-mobile.png',fullPage:true});
  });
  await page.setViewportSize({width:1440,height:1000});
  await check('source form uses actual private PDF, preserves draft for invalid page and opens authorized inline URL',async()=>{
    await page.locator('#file-kind').selectOption('document');await page.locator('#file-source').fill('CAREER-01');
    await page.locator('#file-input').setInputFiles({name:'CAREER-01.pdf',mimeType:'application/pdf',buffer:createSourceLibrary().pdf('CAREER-01')});
    await page.locator('#upload-file').click();await page.waitForFunction(()=>document.querySelectorAll('.file-row').length===4);
    await page.locator('[data-view=posts]').click();await page.locator('.post-button').first().click();
    await page.locator('#add-source').click();
    assert.equal(await page.locator('#source-refs [data-field=id] option').count(),14);
    await page.locator('#source-refs [data-field=id]').selectOption('CAREER-01');
    await page.locator('#source-refs [data-field=pages]').fill('99999');await page.locator('#source-refs [data-field=section]').fill('Ví dụ căn cứ thử');
    await page.locator('#source-refs [data-field=supports]').fill('Nhận định fixture dùng để kiểm UI.');await page.locator('#source-refs [data-field=adaptation]').fill('Đối chiếu thủ công trước khi dùng trong bài.');
    await page.locator('#source-note').fill('Ghi chú thử trên kho kiểm thử riêng.');await page.locator('#save').click();
    await page.waitForFunction(()=>document.getElementById('message').textContent.includes('Trang PDF'));
    assert.equal(await page.locator('#source-refs [data-field=pages]').inputValue(),'99999');
    await page.locator('#source-refs [data-field=pages]').fill('1');await page.locator('#save').click();
    await page.waitForFunction(()=>document.getElementById('version-label').textContent==='Phiên bản 5');
    assert.equal(await page.locator('#post-image').isHidden(),true);
    const href=await page.locator('.source-pdf-link').getAttribute('href');assert.match(href,/CAREER-01\/pdf#page=1$/);
    const response=await page.request.get(base+href);assert.equal(response.status(),200);assert.match(response.headers()['content-disposition'],/^inline/);
    assert.equal((await fetch(base+href)).status,401);
    const popupPromise=context.waitForEvent('page');await page.locator('.source-pdf-link').click();const popup=await popupPromise;
    await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),base+href);
    if(headedPDF){
      // Chrome renders PDF in its extension frame, not an embed in the main document.
      const pdfFrame=await new Promise((resolve,reject)=>{const found=()=>popup.frames().find(frame=>frame.url().startsWith('chrome-extension://')&&frame.url().endsWith('/index.html'));const existing=found();if(existing){resolve(existing);return;}const timeout=setTimeout(()=>reject(new Error('PDF renderer frame missing')),15000);popup.on('framenavigated',()=>{const frame=found();if(frame){clearTimeout(timeout);resolve(frame);}});});
      await pdfFrame.locator('viewer-page-selector input').waitFor();
      assert.equal(await pdfFrame.locator('viewer-page-selector input').inputValue(),'1');
      const pageSelector=pdfFrame.locator('viewer-page-selector');
      await pdfFrame.waitForFunction(el=>Number(el.docLength)>0,await pageSelector.elementHandle());
      assert.equal(await pageSelector.evaluate(el=>Number(el.docLength)),createSourceLibrary().list().find(s=>s.id==='CAREER-01').pages);
      await popup.waitForLoadState('networkidle');
      await popup.screenshot({path:'tmp/step-15/pdf-inline-browser.png'});
    }
    await popup.close();
  });
  await check('image and five explicit confirmations create a cloud review without publishing',async()=>{
    await page.locator('#attach-image').click();await page.waitForFunction(()=>document.getElementById('version-label').textContent==='Phiên bản 6');
    await page.locator('#audit-post').click();await page.waitForFunction(()=>!document.getElementById('record-review').disabled);
    for(const checkbox of await page.locator('#review-form input').all())await checkbox.check();
    await page.locator('#record-review').click();await page.waitForFunction(()=>document.getElementById('post-audit').textContent.includes('Đã rà soát bởi'));
    assert.match(await page.locator('#post-audit').textContent(),/tranthanhtung37/);
    assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM cloud_reviews').first()).n,1);
    assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM content_checks').first()).n,0);
    assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM publish_jobs').first()).n,0);
    await page.screenshot({path:'tmp/step-15/source-review-desktop.png',fullPage:true});
    await page.locator('.source-panel').screenshot({path:'tmp/step-15/source-form-desktop.png'});
    await page.locator('.review-panel').screenshot({path:'tmp/step-15/review-desktop.png'});
  });
  await check('source edit invalidates review and warehouse audit explains all forty briefs',async()=>{
    await page.locator('#source-refs [data-field=pages]').fill('2');assert.equal(await page.locator('#record-review').isDisabled(),true);
    await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('version-label').textContent==='Phiên bản 7');
    await page.locator('#audit-post').click();await page.waitForFunction(()=>document.getElementById('post-audit').textContent.includes('Cần gắn ảnh'));
    assert.equal(await page.locator('#record-review').isDisabled(),true);
    await page.locator('#audit-warehouse').click();await page.waitForFunction(()=>document.getElementById('warehouse-audit').textContent.includes('40 bài'));
    assert.equal(await page.locator('#warehouse-audit button').count(),40);
    assert.match(await page.locator('#warehouse-audit h3').textContent(),/0 bài đã rà soát/);
  });
  await check('source and review forms remain usable at mobile width',async()=>{
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#source-refs [data-field=section]').focus();assert.notEqual(await page.locator('#source-refs [data-field=section]').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
    await page.screenshot({path:'tmp/step-15/source-review-mobile.png',fullPage:true});
    await page.locator('.source-panel').screenshot({path:'tmp/step-15/source-form-mobile.png'});
  });
  mkdirSync('tmp/step-16',{recursive:true});
  await check('builder loads three real pinned private logos and OFL fonts, and blocks invalid preview',async()=>{
    for(const logo of DESIGN_REGISTRY.logos)await uploadFile(f.env,f.owner,{kind:'logo',filename:logo.file,contentType:logo.file.endsWith('.jpg')?'image/jpeg':'image/png'},readFileSync('assets/brand/originals/'+logo.file));
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#design-headline').fill('Ba bước xây dựng hồ sơ năng lực');
    for(const [i,text] of ['Chọn một vấn đề cụ thể','Làm thử và kiểm chứng kết quả','Ghi lại điều học được'].entries())await page.locator('#design-point-'+(i+1)).fill(text);
    await page.locator('#design-note').fill('Thực hành nhỏ, bằng chứng rõ');
    await page.locator('#design-ink').fill('#f2f6fa');await page.locator('#preview-artwork').click();
    await page.waitForFunction(()=>document.getElementById('design-status').textContent.includes('tương phản'));assert.equal(await page.locator('#save-artwork').isDisabled(),true);
    await page.locator('#design-ink').fill('#163348');await page.locator('#design-headline').fill('W'.repeat(100));await page.locator('#preview-artwork').click();
    await page.waitForFunction(()=>document.getElementById('design-status').textContent.includes('vượt diện tích'));assert.equal(await page.locator('#artwork-preview').isHidden(),true);
    await page.locator('#design-headline').fill('Học AI 📚');await page.locator('#preview-artwork').click();await page.waitForFunction(()=>document.getElementById('design-status').textContent.includes('ký tự'));
    await page.locator('#design-headline').fill('Ba bước xây dựng hồ sơ năng lực');await page.locator('#preview-artwork').click();await page.waitForFunction(()=>!document.getElementById('save-artwork').disabled);
    await page.locator('.artwork-builder').screenshot({path:'tmp/step-16/builder-desktop.png'});
  });
  async function exportPNG(name){const encoded=await page.locator('#artwork-preview').evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]);writeFileSync('tmp/step-16/'+name+'.png',Buffer.from(encoded,'base64'));return Buffer.from(encoded,'base64');}
  await check('infographic renderer is repeatable and upload creates pinned design version without readiness',async()=>{
    const first=await exportPNG('infographic');await page.locator('#preview-artwork').click();await page.waitForFunction(()=>!document.getElementById('save-artwork').disabled);assert.deepEqual(await exportPNG('infographic-repeat'),first);
    let loseResponse=true;
    await page.route('**/api/posts/*/artwork',async route=>{if(loseResponse){loseResponse=false;await route.fetch();await route.abort('failed');}else await route.continue();});
    await page.locator('#save-artwork').click();await page.waitForFunction(()=>document.getElementById('design-status').textContent.includes('Bấm lưu lại'));
    assert.equal(await page.locator('#version-label').textContent(),'Phiên bản 7');assert.equal(await page.locator('#save-artwork').isEnabled(),true);
    await page.locator('#save-artwork').click();await page.waitForFunction(()=>document.getElementById('version-label').textContent==='Phiên bản 8');await page.unroute('**/api/posts/*/artwork');
    const saved=await(await page.request.get(base+'/api/catalog')).json();const post=saved.posts.find(p=>p.version===8);assert.equal(post.imageDesign.renderer,'canvas-square-v1');assert.equal(post.imageDesign.spec.points.length,3);assert.equal(post.ready,false);
    assert.deepEqual(await(await page.request.get(base+post.imageUrl)).body(),first);assert.equal((await fetch(base+post.imageUrl)).status,401);
    await page.locator('#design-note').fill('Ghi lại tiến bộ qua mỗi lần thực hành');assert.equal(await page.locator('#save-artwork').isDisabled(),true);assert.equal(await page.locator('#artwork-preview').isHidden(),true);
  });
  await check('all three minimal illustration motifs, custom palette and mobile canvas remain usable',async()=>{
    await page.locator('#design-layout').selectOption('illustration');await page.locator('#design-headline').fill('Kết nối kỹ năng với cơ hội nghề nghiệp');
    await page.locator('#design-paper').fill('#eaf5ef');await page.locator('#design-ink').fill('#123b30');await page.locator('#design-accent').fill('#176044');
    for(const motif of ['network','process','portfolio']){await page.locator('#design-motif').selectOption(motif);await page.locator('#preview-artwork').click();await page.waitForFunction(()=>!document.getElementById('save-artwork').disabled);await exportPNG('illustration-'+motif);}
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('.artwork-builder').screenshot({path:'tmp/step-16/builder-mobile.png'});
    await page.locator('#save-artwork').click();await page.waitForFunction(()=>document.getElementById('version-label').textContent==='Phiên bản 9');
    assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM publish_jobs').first()).n,0);assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM content_checks').first()).n,0);
  });
  mkdirSync('tmp/step-17',{recursive:true});
  let backupId;
  await check('cloud backup UI resumes the same pinned snapshot after interrupted copy and shows file progress',async()=>{
    assert.equal((await fetch(base+'/api/backups')).status,401);await page.setViewportSize({width:1440,height:1000});await page.locator('[data-view=backups]').click();await page.waitForFunction(()=>document.getElementById('backup-list').textContent.includes('Chưa có'));
    let interrupt=true;await page.route('**/api/backups/*/continue',async route=>{if(interrupt){interrupt=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'BACKUP_WRITE_FAILED'})});}else await route.continue();});
    await page.locator('#create-backup').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('Chưa lưu được file sao lưu'));
    await page.locator('.backup-row').waitFor();assert.equal(await page.locator('.backup-row').count(),1);await page.getByRole('button',{name:'Tiếp tục bản sao'}).click();await page.waitForFunction(()=>document.getElementById('backup-list').textContent.includes('Đã hoàn tất'));await page.unroute('**/api/backups/*/continue');
    const list=await(await page.request.get(base+'/api/backups')).json();assert.equal(list.backups.length,1);assert.equal(list.backups[0].state,'complete');backupId=list.backups[0].id;
    await page.screenshot({path:'tmp/step-17/backups-desktop.png',fullPage:true});
  });
  await check('backup UI verifies every file and remains usable on mobile',async()=>{
    await page.getByRole('button',{name:'Kiểm tra bản sao',exact:true}).click();await page.waitForFunction(()=>document.getElementById('backup-list').textContent.includes('Kiểm tra gần nhất'));
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.waitForFunction(()=>!document.getElementById('create-backup').disabled);await page.keyboard.press('Tab');await page.locator('#create-backup').focus();assert.notEqual(await page.locator('#create-backup').evaluate(el=>getComputedStyle(el).outlineStyle),'none');await page.screenshot({path:'tmp/step-17/backups-mobile.png',fullPage:true});
  });
  await check('downloaded ZIP passes Python independent CRC checks and restores isolated SQLite with history preserved and all versions quarantined',async()=>{
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Tải gói ZIP'}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),backupId+'.zip');await download.saveAs('tmp/step-17/browser-backup.zip');
    const bundle='tmp/step-17/browser-extracted-'+crypto.randomUUID();
    const script="import zipfile,pathlib,sys\nroot=pathlib.Path(sys.argv[2]).resolve()\nassert pathlib.Path.cwd().resolve() in root.parents\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n assert len(z.infolist())<=263\n for f in z.infolist():\n  p=(root/f.filename).resolve();assert root in p.parents and f.file_size<=12*1048576\n z.extractall(root)\nprint('Independent ZIP CRC/extraction passed')\n";
    const checked=spawnSync('C:/Users/trant/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['-c',script,'tmp/step-17/browser-backup.zip',bundle],{encoding:'utf8'});assert.equal(checked.status,0,checked.stderr);
    const restored=restoreCloudBundle({bundle,requestId:crypto.randomUUID(),confirmQuarantine:true}),db=new DatabaseSync(restored.database,{readOnly:true});
    try{assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n,40);assert.equal(db.prepare('SELECT count(*) n FROM cloud_reviews').get().n,1);assert.equal(db.prepare("SELECT count(*) n FROM post_versions WHERE status!='quarantined'").get().n,0);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);}finally{db.close();}
    writeFileSync('tmp/step-17/browser-restore-result.json',JSON.stringify(restored,null,2));assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM publish_jobs').first()).n,0);
  });
  await check('Telegram panel blocks sends until configured and discovers only the private start chat ID',async()=>{
    await page.getByRole('button',{name:'Cảnh báo',exact:true}).click();await page.waitForFunction(()=>document.getElementById('telegram-connection').textContent.includes('chưa đủ'));assert.equal(await page.locator('#telegram-test').isDisabled(),true);
    Object.assign(f.env,{TELEGRAM_ENABLED:'true',TELEGRAM_BOT_TOKEN:'123456789:'+'t'.repeat(35),TELEGRAM_CHAT_ID:'12345678'});await page.locator('#telegram-refresh').click();await page.waitForFunction(()=>!document.getElementById('telegram-test').disabled);await page.getByText('Thiết lập từ đầu',{exact:true}).click();await page.locator('#telegram-discover').click();await page.waitForFunction(()=>document.getElementById('telegram-chats').textContent.includes('12345678'));assert.equal((await page.content()).includes(f.env.TELEGRAM_BOT_TOKEN),false);
  });
  await check('Telegram UI shows permanent failure and retries only the notification after correcting connection',async()=>{
    await page.locator('#telegram-test').click();await page.waitForFunction(()=>document.getElementById('telegram-events').textContent.includes('Cần xử lý'));assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM notification_outbox').first()).n,1);telegramMode='success';await f.env.DB.prepare('UPDATE cloud_telegram_runtime SET next_send_at=NULL WHERE id=1').run();await page.getByRole('button',{name:'Thử lại sau khi sửa kết nối',exact:true}).click();await page.waitForFunction(()=>document.getElementById('telegram-events').textContent.includes('Đã được Telegram tiếp nhận'));assert.equal((await f.env.DB.prepare('SELECT tries FROM notification_outbox').first()).tries,2);assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM publish_jobs').first()).n,0);await page.setViewportSize({width:1440,height:1000});mkdirSync('tmp/step-18',{recursive:true});await page.screenshot({path:'tmp/step-18/telegram-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'tmp/step-18/telegram-mobile.png',fullPage:true});
  });
  assert.deepEqual(errors,[]);
  writeFileSync('tmp/step-15/browser-results.json',JSON.stringify({results,errors,nativePDFViewer:headedPDF,mode:'isolated local D1/R2 and fixture session; not Google login acceptance'},null,2));
  console.log('PASS '+results.length+' cloud browser checks');
  writeFileSync('tmp/step-16/browser-results.json',JSON.stringify({results,errors,mode:'local private originals and fixture D1/R2; no remote owner mutation'},null,2));
  writeFileSync('tmp/step-17/browser-results.json',JSON.stringify({results,errors,mode:'fixture D1/R2, private originals, independent Python ZIP check and isolated SQLite restore'},null,2));
  writeFileSync('tmp/step-18/browser-results.json',JSON.stringify({results,errors,mode:'fixture D1/R2 and mocked Telegram; no remote messages'},null,2));
} finally {globalThis.fetch=originalFetch;await browser.close();await new Promise(resolve=>server.close(resolve));await f.dispose();}
