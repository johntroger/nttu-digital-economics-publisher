import test from 'node:test';
import assert from 'node:assert/strict';
import { parseD1Output } from '../scripts/upload-private-assets.mjs';
test('D1 administrative import parses JSON after Wrangler progress and rejects missing or failed results',()=>{
  const rows=[{id:'fixture',state:'complete'}],data=JSON.stringify([{success:true,results:rows}]);
  assert.deepEqual(parseD1Output('├ Checking if file needs uploading\n'+data+'\n'),rows);
  assert.deepEqual(parseD1Output(data),rows);
  for(const output of ['not JSON','[]','[{"success":false,"results":[]}]','[{"success":true}]',data+'\nnot JSON'])assert.throws(()=>parseD1Output(output));
});
