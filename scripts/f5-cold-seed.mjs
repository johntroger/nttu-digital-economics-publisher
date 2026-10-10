// Test-only seed applied by f5-cloud after its private clone ownership guard.
// Seed before deploying the Worker so its first request measures a due claim,
// rather than warming the isolate with the /reset harness route.
import {metaFingerprint} from '../src/cloud/meta.ts';
import {SIMULATION_META} from './production-actions-runner.mjs';
export async function f5ColdSeedSQL(){
 const fingerprint=await metaFingerprint(SIMULATION_META),at=Date.parse('2026-10-08T03:00:00Z');
 if(!/^[a-f0-9]{64}$/.test(fingerprint))throw Error('F5 fixture fingerprint invalid');
 return `DELETE FROM production_send_permits;
UPDATE application_state SET paused_by_user=0,maintenance_owner=NULL,blocked_reasons='[]' WHERE environment='production';
UPDATE production_publisher_config SET enabled=1,start_date='2026-10-08',active_job=NULL,blocked=NULL,stock_pending=0,connection_hash='${fingerprint}' WHERE id=1;
INSERT INTO production_send_permits(id,page_id,version_id,caption,checksum,business_date,due_at,expires_at,mode,actor,approved_at)
 SELECT 'f5-private-permit','817593604765443',v.id,r.caption_snapshot,a.checksum,'2026-10-08',${at},${at+3600000},'test','tranthanhtung37@gmail.com',${at-1000}
 FROM posts p JOIN content_entries c ON c.post_id=p.id JOIN post_versions v ON v.id=c.active_version_id JOIN cloud_reviews r ON r.version_id=v.id AND r.check_version=v.check_version JOIN assets a ON a.id=v.asset_id WHERE p.content_key='P01';`;
}
