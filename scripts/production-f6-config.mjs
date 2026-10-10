import {productionConfig} from './production-prepare.mjs';
import {productionMigrations} from './production-management-prepare.mjs';
export const F6_RUNNER_ORIGIN='https://nttu-publisher-runner.nttu-kts-johntroger.workers.dev';
// Pure, closed proposal. This function neither writes nor deploys anything.
export function closedF6Configuration(releaseSha){
 const settings={databaseId:'09cdecc7-36a2-4196-950e-ef68b1ecd834',releaseSha,origin:'https://nttu-publisher-production.nttu-kts-johntroger.workers.dev'};
 const base=productionConfig(settings);
 const common={...base.vars,INTEGRATION_MODE:'management',PRODUCTION_DATABASE_ID:settings.databaseId,PRODUCTION_ASSET_BUCKET:'nttu-publisher-production-assets',PRODUCTION_PUBLISHER_ENABLED:'false',PRODUCTION_RUNNER_ENABLED:'false',RUNNER_ORIGIN:F6_RUNNER_ORIGIN,META_PAGE_ID:'817593604765443',META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify'};
 const runner={...base,name:'nttu-publisher-runner',main:'src/production/runner-worker.ts',vars:common,limits:{cpu_ms:10}};
 const management={...base,main:'src/production/worker.ts',vars:{...common,AUTH_ORIGIN:settings.origin,GOOGLE_CLIENT_ID:'716670304393-ddiqdq6k3b5kbgjrb947vsigpakkbvo5.apps.googleusercontent.com',TELEGRAM_CHAT_ID:'1548618770',TELEGRAM_ENABLED:'true'},assets:{directory:'ui/production',binding:'ASSETS',run_worker_first:true}};
 return {runner,management,migrations:productionMigrations(settings.databaseId,{publisherRunner:true}).slice(14),githubVariables:{PRODUCTION_ACTIONS_ENABLED:'false',PRODUCTION_RUNNER_RELEASE:releaseSha,PRODUCTION_BILLING_POLICY:''},credentials:{runner:['PRODUCTION_RUNNER_TOKEN','PRODUCTION_MONITOR_TOKEN'],management:['GOOGLE_CLIENT_SECRET','SESSION_SIGNING_KEY','PRODUCTION_RUNNER_TOKEN','PRODUCTION_MONITOR_TOKEN','PRODUCTION_TRIGGER_TOKEN','TELEGRAM_BOT_TOKEN','META_APP_SECRET','META_PAGE_ACCESS_TOKEN'],github:['PRODUCTION_RUNNER_TOKEN','PRODUCTION_BILLING_READ_TOKEN','PRODUCTION_META_APP_SECRET','PRODUCTION_META_PAGE_ACCESS_TOKEN']},rolloutApproved:false,postingApproved:false};
}
