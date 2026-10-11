// Explicit banked-chart data for funded rule fixtures. This is not an earned
// exploration path; browser/native tests use their own normally earned saves.
import {explorations,explorationSites} from '../src/exploration-content.js';
import {fieldDecisions} from '../src/expedition-content.js';
export function twoBankedCharts(g){
  const c=g.campaign;c.atlas||={version:1,charts:{}};c.frontier||={version:1,cleared:[],records:{},totalSeconds:0};
  for(const d of explorations.filter(d=>d.chapter===0)){
    const sites=explorationSites(d,2),ids=sites.map(s=>s.id);if(!c.frontier.cleared.includes(d.id))c.frontier.cleared.push(d.id);
    c.frontier.records[d.id]={seconds:0,score:100,standing:g.facilities.length,kills:0,surveyed:8};
    c.atlas.charts[d.id]={seen:[...ids],surveyed:[...ids],choices:Object.fromEntries(sites.map(s=>[s.id,fieldDecisions[s.decision].options[0].id])),returns:1,fullRewarded:true,legacySurveyed:0,layoutVersion:2};
  }
}
