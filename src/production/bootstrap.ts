// Production is deliberately isolated from the staging publisher until its
// database, authentication, content and Page connection have been accepted.
export interface BootstrapBindings {
  APP_ENV?: string;
  INTEGRATION_MODE?: string;
  DAILY_PUBLISHING_ENABLED?: string;
  RELEASE_SHA?: string;
}
export default {
  async fetch(request: Request, env: BootstrapBindings): Promise<Response> {
    const valid = env.APP_ENV === 'production' && env.INTEGRATION_MODE === 'bootstrap'
      && env.DAILY_PUBLISHING_ENABLED === 'false' && /^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '');
    const headers = {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
    if (!valid) return Response.json({error:'PRODUCTION_BOOTSTRAP_CONFIG_INVALID'}, {status:503, headers});
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return Response.json({environment:'production', release:env.RELEASE_SHA,
        phase:'bootstrap', publishingImplemented:false, publishingEnabled:false,
        schedulerImplemented:false, databaseChecked:false}, {headers});
    }
    // No login, asset, mutation or publication route exists in this phase.
    return Response.json({error:'PRODUCTION_NOT_READY'}, {status:503, headers});
  },
};
