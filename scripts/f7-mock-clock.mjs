// Test transport only: model provider time from the clone's trusted response,
// never the workstation wall clock. No production authorization is changed.
export function f7MockClock(elapsed=()=>performance.now()){
 let anchor;
 return {
  observe(route,value){
   if(route!=='/runner/authorize'||value?.dispatch!==true)return;
   if(!Number.isSafeInteger(value.serverNow))throw Error('F7_MOCK_CLOCK_INVALID');
   anchor={serverNow:value.serverNow,elapsed:elapsed()};
  },
  now(){
   if(!anchor)throw Error('F7_MOCK_CLOCK_UNANCHORED');
   const delta=elapsed()-anchor.elapsed;
   if(!Number.isFinite(delta)||delta<0||delta>180000)throw Error('F7_MOCK_CLOCK_INVALID');
   return anchor.serverNow+Math.ceil(delta);
  }
 };
}
