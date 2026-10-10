import {projectApprovalRows} from '../src/production/preview.ts';
export async function scanRunnerStock(client,{expectedRelease,maxMs=120000}={}){
 const began=performance.now(),scan=await client.call('/runner/stock-start');
 if(!Number.isSafeInteger(scan.scan)||!Number.isSafeInteger(scan.serverNow)||scan.release!==expectedRelease)throw Error('STOCK_RELEASE_INVALID');
 const data=[];
 for(let group=0;group<6;group++){
  const rows=[];let offset=0;
  do{
   if(performance.now()-began>=maxMs)throw Error('STOCK_TIME_BUDGET');
   const page=await client.call('/runner/stock-data',{scan:scan.scan,group,offset});
   if(!Array.isArray(page.rows)||page.rows.length>8||page.next!==null&&page.next!==offset+8)throw Error('STOCK_PAGE_INVALID');
   rows.push(...page.rows);if(rows.length>1024)throw Error('STOCK_LIMIT');offset=page.next;
  }while(offset!==null);
  data.push(rows);
 }
 const used=new Set(data[5].map(x=>x.post));
 const items=await projectApprovalRows(scan.serverNow,'batch',data.slice(0,5));
 const remaining=items.filter(x=>x.approvalValid&&!used.has(x.postId)),main=remaining.filter(x=>x.pool==='scheduled').length;
 if(performance.now()-began>=maxMs)throw Error('STOCK_TIME_BUDGET');
 return client.call('/runner/stock-finalize',{scan:scan.scan,remaining:remaining.length,main,reserve:remaining.length-main,ready:remaining.filter(x=>x.prerequisites.every(id=>used.has(id))).length});
}
