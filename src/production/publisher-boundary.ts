// Resource identities are policy, not credentials. No transport lives in this module.
export const PUBLISHER_RESOURCES = {
  staging:{page:'551227411605506',database:'83881fd7-88e6-4835-b616-6f4f8f2d25cd',bucket:'nttu-publisher-staging-assets'},
  production:{page:'817593604765443',database:'09cdecc7-36a2-4196-950e-ef68b1ecd834',bucket:'nttu-publisher-production-assets'},
} as const;
export function assertPublisherBoundary(environment:string,page:string,database:string,bucket:string) {
  if(environment!=='staging'&&environment!=='production')throw Error('PUBLISHER_ENVIRONMENT_INVALID');
  const expected=PUBLISHER_RESOURCES[environment];
  if(page!==expected.page||database!==expected.database||bucket!==expected.bucket)throw Error('PUBLISHER_RESOURCE_MISMATCH');
  return expected;
}
