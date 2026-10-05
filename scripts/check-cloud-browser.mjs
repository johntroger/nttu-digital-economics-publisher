// Browser QA uses an isolated loopback harness and fixture session, never real Google credentials.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { managementFixture } from './cloud-management-smoke.mjs';
import worker from '../src/cloud/worker.ts';
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
mkdirSync('tmp/step-13',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],results=[];
page.on('pageerror',error=>errors.push(error.message));
const check=async(name,fn)=>{await fn();results.push(name);};
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
  await page.screenshot({path:'tmp/step-13/cloud-desktop.png',fullPage:true});
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
    await page.screenshot({path:'tmp/step-13/cloud-mobile.png',fullPage:true});
  });
  assert.deepEqual(errors,[]);
  writeFileSync('tmp/step-13/browser-results.json',JSON.stringify({results,errors,mode:'isolated local D1 and fixture session; not Google login acceptance'},null,2));
  console.log('PASS '+results.length+' cloud browser checks');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));await f.dispose();}
