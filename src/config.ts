export type Environment = 'local' | 'staging' | 'production';
export type IntegrationMode = 'fake' | 'unconfigured';
export interface Bindings {
  APP_ENV?: string;
  INTEGRATION_MODE?: string;
}

export function readConfiguration(bindings: Bindings): {
  environment: Environment; integrationMode: IntegrationMode;
} {
  const environment = bindings.APP_ENV;
  if (environment !== 'local' && environment !== 'staging' && environment !== 'production') {
    throw new Error('APP_ENV must be explicitly configured');
  }
  const integrationMode = bindings.INTEGRATION_MODE ?? 'unconfigured';
  if (integrationMode !== 'fake' && integrationMode !== 'unconfigured') {
    throw new Error('Integration mode is not supported in step 1');
  }
  if (integrationMode === 'fake' && environment !== 'local') {
    throw new Error('Fake integrations are restricted to local development');
  }
  return { environment, integrationMode };
}
