import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.UI_NODE_BUNDLE??`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`)('playwright');
const base=process.env.UI_BASE_URL??'http://127.0.0.1:3789',output=resolve('tmp/step-07');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.UI_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results=[],errors=[],expectedErrors=[];
const page=await browser.newPage({viewport:{width:1440,height:1050}});
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const check=async(name,work)=>{await work();results.push({name,status:'pass'});};
const screenshot=async name=>page.screenshot({path:resolve(output,name+'.png'),fullPage:!await page.locator('#post-detail').isVisible()});
try{
  await page.goto(base);await page.waitForLoadState('networkidle');
  await check('Five loaded sample cards are labelled pending owner review',async()=>{
    await page.locator('nav [data-view="samples"]').click();assert.equal(await page.locator('.sample-card').count(),5);
    assert.equal(await page.locator('.sample-card>img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth===360)),true);
    assert.match(await page.locator('#view-samples').innerText(),/Chờ bạn duyệt/);await screenshot('samples-desktop');
  });
  await check('All five full captions have one footer and their own loaded 1080px image',async()=>{
    for(const id of ['P02','P04','P05','P06','P08']){
      await page.getByRole('button',{name:`Xem bài mẫu ${id}`,exact:true}).click();
      await page.waitForFunction(()=>{const img=document.getElementById('sample-image');return img.complete&&img.naturalWidth===1080;});
      assert.equal(await page.locator('#detail-sample').isVisible(),true);assert.equal(await page.locator('#detail-brief-only').isVisible(),false);
      const caption=await page.locator('#sample-caption').innerText();assert.equal(caption.split('#NTTU').length-1,1);
      assert.equal(caption.split('============').length-1,1);assert.match(caption,/\n\n============\n\nNgành Kinh tế số/);
      assert.equal(caption.split('NGÀNH KINH TẾ SỐ, KHOA QTKD, TRƯỜNG ĐẠI HỌC NGUYỄN TẤT THÀNH').length-1,1);
      assert.match(caption,/https:\/\/www.tiktok.com\/@nganhkinhteso_nttu/);
      assert.match(caption,/giả định/);assert.ok(await page.locator('#sample-sources li').count()>0);
      if(id==='P05'){assert.match(caption,/3,5 năm/);assert.match(caption,/khóa 2026/);assert.match(await page.locator('#sample-sources').innerText(),/OWNER-2026/);}
      if(id==='P02')await screenshot('P02-detail-desktop');
      await page.keyboard.press('Escape');
    }
  });
  await check('Warehouse opens sample or brief accurately; ready remains zero',async()=>{
    await page.locator('nav [data-view="posts"]').click();await page.locator('#search').fill('P04');await page.locator('.post-link').click();
    assert.equal(await page.locator('#detail-sample').isVisible(),true);await page.keyboard.press('Escape');
    await page.locator('#search').fill('P01');await page.locator('.post-link').click();assert.equal(await page.locator('#detail-brief-only').isVisible(),true);
    await page.keyboard.press('Escape');await page.locator('#clear-filters').click();assert.equal(await page.locator('#post-rows tr').count(),40);
    await page.locator('nav [data-view="overview"]').click();assert.equal(await page.locator('#ready').innerText(),'0');
  });
  await check('Mobile sample grid, dialog, full caption and footer are readable without overflow',async()=>{
    await page.setViewportSize({width:390,height:844});await page.locator('nav [data-view="samples"]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await screenshot('samples-mobile');
    await page.getByRole('button',{name:'Xem bài mẫu P05',exact:true}).click();await screenshot('P05-detail-mobile');
    assert.equal(await page.locator('#post-detail').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
    await page.locator('#post-detail').evaluate(dialog=>{dialog.scrollTop=document.getElementById('sample-caption').offsetTop-20;});await screenshot('P05-caption-mobile');
    await page.locator('#post-detail').evaluate(dialog=>{const caption=document.getElementById('sample-caption');dialog.scrollTop=caption.offsetTop+caption.offsetHeight-dialog.clientHeight+35;});await screenshot('P05-footer-mobile');
    await page.locator('#sample-sources').scrollIntoViewIfNeeded();await screenshot('P05-sources-mobile');
    await page.keyboard.press('Escape');
  });
  await check('Sample load failure leaves real warehouse usable and can retry',async()=>{
    assert.deepEqual(errors,[]);page.removeAllListeners('console');page.on('console',message=>{if(message.type()==='error')expectedErrors.push(message.text());});
    await page.route('**/local-api/samples',route=>route.fulfill({status:409,json:{code:'SAMPLE_PREVIEW_NOT_READY'}}));
    await page.reload();await page.waitForLoadState('networkidle');await page.locator('nav [data-view="samples"]').click();
    assert.equal(await page.locator('.sample-card').count(),0);assert.match(await page.locator('#sample-load-status').innerText(),/Chưa tải được/);
    await page.locator('nav [data-view="posts"]').click();assert.equal(await page.locator('#post-rows tr').count(),40);
    await page.unroute('**/local-api/samples');await page.locator('nav [data-view="samples"]').click();await page.getByRole('button',{name:'Thử tải lại',exact:true}).click();
    await page.waitForSelector('.sample-card');assert.equal(await page.locator('.sample-card').count(),5);
  });
  writeFileSync(resolve(output,'browser-results.json'),JSON.stringify({results,normalConsoleErrors:errors,expectedFailureConsole:expectedErrors},null,2)+'\n');
  console.log(`${results.length} sample browser checks passed; evidence in tmp/step-07/`);
}finally{await browser.close();}
