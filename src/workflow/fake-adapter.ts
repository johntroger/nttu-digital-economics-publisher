import type { EvidenceInput } from '../storage/evidence.ts';
export interface FakeRequest { attemptId:string;jobId:string;caption:string;assetKey:string;checksum:string;footerVersion:string;pageConnection:string }
export type FakeResult = 'confirmed'|'retryable'|'final'|'policy'|'global'|'unknown'|'throw';
export class FakePublisher {
  readonly mode='local_fake';
  readonly requests:FakeRequest[]=[];
  private results:FakeResult[];
  constructor(results:FakeResult[]=['confirmed']) {this.results=[...results];}
  async publish(request:FakeRequest,now:string):Promise<Omit<EvidenceInput,'id'|'eventKey'>> {
    this.requests.push({...request});
    const result=this.results.shift()??'confirmed';
    if(result==='throw') throw new Error('Simulated ambiguous transport failure');
    return {attemptId:request.attemptId,page:request.pageConnection,
      outcome:result==='confirmed'?'confirmed':result==='unknown'?'unknown':result==='retryable'?'verified_failed_retryable':'verified_failed_final',
      remoteId:result==='confirmed'?`fixture:remote:${request.attemptId}`:null,
      remotePublishedAt:result==='confirmed'?now:null,remoteLink:result==='confirmed'?'https://example.invalid/local-simulation':null,
      failureKind:result==='confirmed'||result==='unknown'?null:result==='retryable'?'retryable':result,
      retryAt:null,observedAt:now};
  }
}
