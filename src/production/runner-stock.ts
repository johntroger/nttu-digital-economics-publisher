import type {ManagementBindings} from './management.ts';
import {approvalQueries} from './preview.ts';
import {readSnapshotSQL} from './read-pages.ts';
type Row=Record<string,any>;
// Include published usage as well as content eligibility. Finalize compares this
// inside the same D1 transaction as the warning/stock writes.
const snapshotSQL=`SELECT json_array(json(snapshot),
 (SELECT json_group_array(json(row)) FROM (SELECT json_array(day,post,remote_id) row FROM production_publisher_usage ORDER BY day,post)),
 (SELECT json_array(revision,enabled,blocked) FROM production_publisher_config WHERE id=1)) snapshot FROM (${readSnapshotSQL()})`;
const queries=approvalQueries();
const groups=[queries[0]!.sql,queries[1]!.sql+' ORDER BY x.version_id,s.id,x.location',queries[2]!.sql+' ORDER BY x.version_id,f.id',queries[3]!.sql,queries[4]!.sql+' ORDER BY post_id,prerequisite_id','SELECT post FROM production_publisher_usage ORDER BY post'];
export async function runnerStock(env:ManagementBindings,path:string,b:Row,n:number){
 const stmt=(sql:string,...args:(string|number|null)[])=>env.DB!.prepare(sql).bind(...args);
 const first=(sql:string,...args:(string|number|null)[])=>stmt(sql,...args).first<Row>();
 const keys=path==='/runner/stock-start'?[]:path==='/runner/stock-data'?['scan','group','offset']:['scan','remaining','main','reserve','ready'];
 if(Object.keys(b).some(k=>!keys.includes(k)))throw Error('STOCK_INPUT_INVALID');
 if(path==='/runner/stock-start'){
  const row=await first(`INSERT INTO production_publisher_stock_scan(id,snapshot,release,started_at,cursor,remaining,revision)
   SELECT 1,snapshot,?,?,0,0,1 FROM (${snapshotSQL}) WHERE 1
   ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,release=excluded.release,started_at=excluded.started_at,cursor=0,remaining=0,commit_token=NULL,revision=revision+1 RETURNING revision`,env.RELEASE_SHA!,n,n,n,n);
  return {scan:row!.revision,serverNow:n,release:env.RELEASE_SHA};
 }
 if(!Number.isSafeInteger(b.scan)||b.scan<1)throw Error('STOCK_SCAN_INVALID');
 const scan=await first('SELECT * FROM production_publisher_stock_scan WHERE id=1 AND revision=?',b.scan);
 if(!scan||scan.release!==env.RELEASE_SHA||n<scan.started_at||n>=scan.started_at+300000)throw Error('STOCK_SCAN_EXPIRED');
 if(path==='/runner/stock-data'){
  if(!Number.isInteger(b.group)||b.group<0||b.group>5||!Number.isInteger(b.offset)||b.offset<0||b.offset>1024||scan.cursor!==b.group*100000+b.offset)throw Error('STOCK_CURSOR_INVALID');
  const data=await stmt(groups[b.group]+' LIMIT 8 OFFSET ?',b.offset).all!<Row>();
  const next=data.results.length===8?b.offset+8:null,cursor=next===null?(b.group+1)*100000:b.group*100000+next;
  const saved=await first('UPDATE production_publisher_stock_scan SET cursor=? WHERE id=1 AND revision=? AND cursor=? RETURNING id',cursor,b.scan,scan.cursor);
  if(!saved)throw Error('STOCK_SCAN_CHANGED');return {rows:data.results,next};
 }
 if(scan.cursor!==600000||['remaining','main','reserve','ready'].some(k=>!Number.isSafeInteger(b[k])||b[k]<0||b[k]>1024)||b.remaining!==b.main+b.reserve||b.ready>b.remaining)throw Error('STOCK_FINALIZE_INVALID');
 const level=b.remaining===0?'empty':b.remaining<=3?'low':'normal',commit=crypto.randomUUID();
 const changed=await env.DB!.batch!([
  stmt(`UPDATE production_publisher_stock_scan SET cursor=700000,remaining=?,commit_token=? WHERE id=1 AND revision=? AND cursor=600000 AND release=? AND started_at>? AND snapshot=(SELECT snapshot FROM (${snapshotSQL})) RETURNING id`,b.remaining,commit,b.scan,env.RELEASE_SHA!,n-300000,n,n,n),
  stmt(`INSERT INTO notification_outbox(event_id,payload_json) SELECT 'production-stock:'||(stock_episode+1),? FROM production_publisher_config WHERE id=1 AND stock_level<>? AND ?<>'normal' AND EXISTS(SELECT 1 FROM production_publisher_stock_scan WHERE commit_token=?) ON CONFLICT(event_id) DO NOTHING`,JSON.stringify({kind:level==='empty'?'stock_empty':'stock_low',environment:'production',title:b.remaining+' bài đã duyệt còn trong kho'}),level,level,commit),
  stmt('UPDATE production_publisher_config SET stock_pending=0,stock_episode=stock_episode+CASE WHEN stock_level<>? THEN 1 ELSE 0 END,stock_level=? WHERE id=1 AND EXISTS(SELECT 1 FROM production_publisher_stock_scan WHERE commit_token=?)',level,level,commit)
 ]) as {results?:Row[]}[];
 if(!changed[0]?.results?.length)throw Error('STOCK_SNAPSHOT_CHANGED');
 return {state:'stock_confirmed',remaining:b.remaining,main:b.main,reserve:b.reserve,ready:b.ready,level};
}
