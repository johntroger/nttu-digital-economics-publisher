// Build a review package only. Never accesses accounts, copies credentials,
// migrates a database, changes live schedules or grants rollout permission.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {prepareClosedF7} from './production-f7-prepare.mjs';
import {actionsForecast} from './production-f7-forecast.mjs';
const sha=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(sha??''))throw Error('F7_REVIEW_SHA_REQUIRED');
const closed=prepareClosedF7(sha),directory=closed.directory;
const policy=JSON.parse(readFileSync('cloud/production-billing-policy.example.json'));
if(policy.ownerApproved!==false||policy.verifiedAt!==null||policy.releaseSha!==null)throw Error('F7_POLICY_TEMPLATE_MUST_BE_CLOSED');
writeFileSync(resolve(directory,'billing-policy.template.json'),JSON.stringify(policy,null,2)+'\n');
writeFileSync(resolve(directory,'deployment-dossier.md'),readFileSync('docs/steps/38-f7-deployment-dossier.md'));
const forecast=actionsForecast({includedMinutes:2000,usedMinutes:1116,daysRemaining:22,monitorRunsPerDay:1,monitorMinutesPerRun:5,monitorFallbackRuns:4,ciReserveMinutes:300,otherReserveMinutes:100});
const plan={releaseSha:sha,preparationOnly:true,liveStateChanged:false,credentialsCopied:false,postingApproved:false,rolloutApproved:false,
 budget:{mechanism:'owner-monthly-attestation',reserveMinutes:600,automaticRenewal:false,policyApplied:false},
 forecast:{...forecast,source:'historical sanitized receipt, NOT current quota',capturedAt:'2026-10-10T09:41:39.310Z',freshQuotaRequired:true},
 proposedSchedules:{publishingTime:'10:00',timeZone:'Asia/Ho_Chi_Minh',dailyPosts:1,monitorPrimaryUTC:'30 3 * * *',monitorFallbackUTC:'23 14 * * 0',applied:false},
 pending:['exact-release-ci','cloud-cpu-cold-warm','browser-owner-ui','fresh-account-quota-and-storage','r2-standard-storage-and-usage','owner-budget-attestation','fresh-backup-and-restore','migration-and-credentials-approval','real-post-approval'],
 rollback:{unresolvedJournalMustBePreserved:true,automaticLegacyActivation:false},readiness:closed.readiness};
writeFileSync(resolve(directory,'deployment-plan.json'),JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({directory,releaseSha:sha,preparationOnly:true,rolloutApproved:false,postingApproved:false,pending:plan.pending}));
