import type {CloudBindings} from './runtime.ts';
import {readStatus} from './runtime.ts';
import {createCloudReview} from './review.ts';
import {dailyStatus} from './daily.ts';
import {POLICY} from '../domain/policy.ts';

// Read-only operational preflight. Simulation never imports into the live Worker.
export async function cloudWorkflowStatus(env:CloudBindings){
  await readStatus(env);
  const audit=await createCloudReview(env).warehouseAudit();
  const daily=await dailyStatus(env);
  return {environment:'staging',paused:daily.paused,publishingEnabled:daily.enabled,simulationAvailableOnStaging:false,
    publishTime:POLICY.publishTime,historyCheckTime:POLICY.historyCheckTime,timeZone:POLICY.timeZone,
    maxAttempts:POLICY.maxPublishAttempts,retryMinutes:POLICY.retryDelayMinutes,
    totalPosts:audit.total,structurallyReviewable:audit.canReview,reviewedPosts:audit.reviewed,
    eligibleToPublish:0,blockers:[...(daily.paused?['SCHEDULE_PAUSED']:[]),...(!daily.deploymentGate?['DAILY_DEPLOYMENT_GATE_CLOSED']:[]),...(!daily.startDate?['SCHEDULE_NOT_CONFIGURED']:[])],
    note:'Rà soát cấu trúc và xác nhận nội dung chưa cấp quyền đăng Facebook.'};
}
