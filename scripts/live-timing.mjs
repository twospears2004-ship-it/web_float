import assert from 'node:assert/strict';

// A recovered sortie's real timer starts at Continue. Preserve that observation
// while refusing to present its partial duration as the complete played time.
export function summarizeLiveTiming(records){
  let gameSeconds=0,observedCompletedSortieRealSeconds=0;const partialTimingSorties=[],unknownTimingSorties=[];
  for(const row of records){
    assert(Number.isFinite(row.gameSeconds)&&row.gameSeconds>=0,`${row.id}: invalid game timing`);gameSeconds+=row.gameSeconds;
    assert(row.realSeconds===null||Number.isFinite(row.realSeconds)&&row.realSeconds>=0,`${row.id}: invalid real timing`);
    if(row.realSeconds!==null)observedCompletedSortieRealSeconds+=row.realSeconds;
    if(row.timingPartial)partialTimingSorties.push(row.id);
    if(row.timingUnavailable||row.realSeconds===null)unknownTimingSorties.push(row.id);
  }
  return {gameSeconds,observedCompletedSortieRealSeconds,completeCompletedSortieRealSeconds:partialTimingSorties.length||unknownTimingSorties.length?null:observedCompletedSortieRealSeconds,partialTimingSorties,unknownTimingSorties};
}
