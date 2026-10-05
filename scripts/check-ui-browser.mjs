// Local visual/interaction acceptance; uses the bundled runtime, adds no project dependency.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const bundle=process.env.UI_NODE_BUNDLE??`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`;
const {chromium}=createRequire(bundle)('playwright');
const base=process.env.UI_BASE_URL??'http://127.0.0.1:3789';
const output=resolve('tmp/step-06');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.UI_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results=[],errors=[],failures=[];
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const check=async(name,work)=>{await work();results.push({name,status:'pass'});};
const nav=view=>page.locator(`nav [data-view="${view}"]`).click();
const shot=name=>page.screenshot({path:resolve(output,name+'.png'),fullPage:!name.startsWith('detail')});
try{
  await page.goto(base);await page.waitForLoadState('networkidle');
  await check('Actual overview: 40 briefs, zero readiness, three loaded logos',async()=>{
    assert.equal(await page.locator('#total').innerText(),'40');assert.equal(await page.locator('#ready').innerText(),'0');
    assert.equal(await page.locator('.logos img').count(),3);
    assert.equal(await page.locator('.logos img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)),true);
    await shot('overview-desktop');
  });
  await nav('posts');
  await check('Search, combined filters, clear and empty result',async()=>{
    assert.equal(await page.locator('#post-rows tr').count(),40);
    await page.locator('#pool').selectOption('reserve');assert.equal(await page.locator('#post-rows tr').count(),10);
    await page.locator('#audience').selectOption('student');
    const catalog=await (await page.request.get(base+'/local-api/catalog')).json();
    assert.equal(await page.locator('#post-rows tr').count(),catalog.posts.filter(p=>p.pool==='reserve'&&p.audience==='student').length);
    await page.locator('#clear-filters').click();await page.locator('#search').fill('P02');assert.equal(await page.locator('#post-rows tr').count(),1);
    await page.locator('#search').fill('zzzzzz');assert.equal(await page.locator('#posts-empty').isVisible(),true);
    await page.locator('#clear-filters').click();assert.equal(await page.locator('#post-rows tr').count(),40);
    await shot('warehouse-desktop');
  });
  await check('Keyboard opens drawer; required footer; Escape restores focus',async()=>{
    const first=page.locator('.post-link').first();await first.focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#post-detail').isVisible(),true);
    assert.match(await page.locator('#detail-footer').textContent(),/https:\/\/www.tiktok.com\/@nganhkinhteso_nttu/);
    assert.equal((await page.locator('#detail-footer').textContent()).split('#NTTU').length-1,1);
    await shot('detail-desktop');await page.keyboard.press('Escape');
    assert.equal(await page.locator('#post-detail').isVisible(),false);assert.equal(await first.evaluate(n=>document.activeElement===n),true);
  });
  await check('Real schedule/history/notifications show honest empty states',async()=>{
    for(const [view,id] of [['schedule','schedule-content'],['history','history-content'],['notifications','notification-content']]){
      await nav(view);assert.equal(await page.locator(`#${id} .empty`).count(),1);assert.equal(await page.locator('#demo-banner').isVisible(),false);
    }
  });
  await nav('simulation');
  for(const [scenario,requests,count] of [['success',1,1],['reserve',4,1],['unknown',1,0],['reserve',4,1]]){
    await check(`Isolated ${scenario} demo (${requests} requests, ${count} publication)`,async()=>{
      await page.locator('#scenario').selectOption(scenario);const response=page.waitForResponse(r=>r.url().endsWith('/local-api/demo'));
      await page.locator('#run-demo').click();const data=await (await response).json();
      await page.waitForFunction(()=>document.getElementById('demo-status').textContent.includes('hoàn tất'));
      assert.equal(data.requests,requests);assert.equal(data.publications.length,count);
      assert.equal(await page.locator('#run-demo').isEnabled(),true);
    });
  }
  await shot('simulation-desktop');
  await check('Demo history, schedule and alerts are explicitly labelled and never delivered',async()=>{
    await page.getByRole('button',{name:'Xem lịch sử mô phỏng',exact:true}).click();
    assert.equal(await page.locator('#history-content .record').count(),1);assert.equal(await page.locator('#demo-banner').isVisible(),true);
    await shot('history-demo-desktop');await nav('schedule');assert.ok(await page.locator('#schedule-content tbody tr').count()>0);
    await nav('notifications');
    assert.match(await page.locator('#notification-content').innerText(),/Chưa gửi qua Telegram/);
    await page.locator('#back-main').click();assert.equal(await page.locator('#notification-content .empty').count(),1);
    await nav('posts');assert.equal(await page.locator('#post-rows tr').count(),40);
  });
  await check('Mobile and tablet layout, usable drawer and no body overflow',async()=>{
    for(const width of [390,768]){
      await page.setViewportSize({width,height:844});await nav('overview');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot(`overview-${width}`);
      await nav('posts');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('.post-link').first().click();assert.equal(await page.locator('#post-detail').isVisible(),true);
      assert.equal(await page.locator('#close-detail').isVisible(),true);await shot(`detail-${width}`);
      await page.locator('#close-detail').click();await nav('simulation');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
  });
  await check('Reduced motion enabled and desktop console has no errors',async()=>{
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
    assert.deepEqual(errors,[]);
  });
  // Deliberately induced failures are collected separately from the clean normal flow.
  page.removeAllListeners('console');page.on('console',message=>{if(message.type()==='error')failures.push(message.text());});
  await check('Catalog failure and retry recover without broken controls',async()=>{
    await page.route('**/local-api/catalog',route=>route.fulfill({status:503,body:'{}',contentType:'application/json'}));
    await page.reload();await page.waitForSelector('#load-error:not([hidden])');await page.unroute('**/local-api/catalog');
    await page.locator('#reload').click();await page.waitForSelector('#view-overview:not([hidden])');assert.equal(await page.locator('#total').innerText(),'40');
  });
  await check('Demo failure can retry and re-enables its action',async()=>{
    await nav('simulation');await page.route('**/local-api/demo',route=>route.fulfill({status:503,body:'{}',contentType:'application/json'}));
    await page.locator('#run-demo').click();await page.waitForFunction(()=>document.getElementById('demo-status').textContent.includes('Không chạy được'));
    assert.equal(await page.locator('#run-demo').isEnabled(),true);await page.unroute('**/local-api/demo');
    await page.locator('#run-demo').click();await page.waitForFunction(()=>document.getElementById('demo-status').textContent.includes('hoàn tất'));
  });
  await check('Untrusted text stays text rather than executing HTML',async()=>{
    const catalog=await (await page.request.get(base+'/local-api/catalog')).json();catalog.posts[0].title='<img src=x onerror="window.injected=true">';
    await page.route('**/local-api/catalog',route=>route.fulfill({json:catalog}));await page.reload();await page.waitForLoadState('networkidle');
    await nav('posts');assert.equal(await page.locator('.post-link').first().textContent(),catalog.posts[0].title);
    assert.equal(await page.locator('.post-link img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  });
  assert.deepEqual(errors,[]);
  writeFileSync(resolve(output,'browser-results.json'),JSON.stringify({browser:'Chrome headless / bundled Node Playwright',results,normalConsoleErrors:errors,expectedFailureConsole:failures},null,2)+'\n');
  console.log(`${results.length} browser acceptance checks passed. Evidence: tmp/step-06/`);
}finally{await browser.close();}
