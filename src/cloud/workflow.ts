import type {CloudBindings} from './runtime.ts';
import {readStatus} from './runtime.ts';
import {createCloudReview} from './review.ts';
import {POLICY} from '../domain/policy.ts';

// Read-only operational preflight. Simulation never imports into the live Worker.
export async function cloudWorkflowStatus(env:CloudBindings){
  await readStatus(env);
  const audit=await createCloudReview(env).warehouseAudit();
  return {environment:'staging',paused:true,publishingEnabled:false,simulationAvailableOnStaging:false,
    publishTime:POLICY.publishTime,historyCheckTime:POLICY.historyCheckTime,timeZone:POLICY.timeZone,
    maxAttempts:POLICY.maxPublishAttempts,retryMinutes:POLICY.retryDelayMinutes,
    totalPosts:audit.total,structurallyReviewable:audit.canReview,reviewedPosts:audit.reviewed,
    eligibleToPublish:0,blockers:['SCHEDULE_PAUSED','META_NOT_CONNECTED','LIVE_PUBLISHER_NOT_IMPLEMENTED'],
    note:'Rà soát cấu trúc và xác nhận nội dung chưa cấp quyền đăng Facebook.'};
}
