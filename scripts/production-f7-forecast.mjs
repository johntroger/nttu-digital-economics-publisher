// Planning only. A forecast cannot grant a send capability or refresh a budget receipt.
export function actionsForecast({includedMinutes,usedMinutes,daysRemaining,monitorRunsPerDay,monitorMinutesPerRun,runnerRunsPerDay=1,runnerMinutesPerRun=5,ciReserveMinutes=300,otherReserveMinutes=0}){
 const ints={includedMinutes,daysRemaining,monitorRunsPerDay,runnerRunsPerDay,runnerMinutesPerRun,ciReserveMinutes,otherReserveMinutes};
 if(Object.values(ints).some(x=>!Number.isSafeInteger(x)||x<0)||includedMinutes>2000||daysRemaining>31||!Number.isFinite(usedMinutes)||usedMinutes<0||!Number.isFinite(monitorMinutesPerRun)||monitorMinutesPerRun<=0)throw Error('F7_FORECAST_INVALID');
 const available=Math.floor(includedMinutes-usedMinutes);
 // Reserve a whole billed minute per job, using measured usage when it is higher.
 const monitor=daysRemaining*monitorRunsPerDay*Math.ceil(monitorMinutesPerRun);
 const runner=daysRemaining*runnerRunsPerDay*runnerMinutesPerRun;
 const reserved=monitor+runner+ciReserveMinutes+otherReserveMinutes;
 return {availableMinutes:available,monitorMinutes:monitor,runnerMinutes:runner,ciReserveMinutes,otherReserveMinutes,reservedMinutes:reserved,headroomMinutes:available-reserved,forecastFits:available>=reserved,activationApproved:false};
}
