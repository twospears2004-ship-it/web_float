// Banked exploration memory. Discoveries and choices become durable only on
// extraction; abandoning a sortie never writes to these charts.
import {explorations,explorationSites,getExploration} from './exploration-content.js';
export const atlasState=()=>({version:1,charts:{}});
const emptyChart=()=>({seen:['explore-node-0'],surveyed:[],choices:{},returns:0,fullRewarded:false,legacySurveyed:0});
export function atlasChart(c,id){
  if(c.atlas?.charts[id])return c.atlas.charts[id];
  const old=c.atlas===undefined?c.frontier?.records[id]:null;
  if(!old)return emptyChart();
  const sites=explorationSites(getExploration(id)),surveyed=sites.filter(s=>old.surveyed===8||s.landmark).map(s=>s.id);
  // Old saves keep a count, not their visited optional node identities or bonus
  // history. Preserve that count and suppress duplicate old completion bonuses.
  return {...emptyChart(),seen:[...new Set(['explore-node-0',...surveyed])],surveyed,returns:1,fullRewarded:true,legacySurveyed:old.surveyed};
}
export function migrateAtlas(c){
  if(c.atlas!==undefined)return c.atlas;
  const charts={};for(const d of explorations)if(c.frontier?.records[d.id])charts[d.id]=atlasChart(c,d.id);
  c.atlas={version:1,charts};return c.atlas;
}
export const atlasHasSurvey=(c,id,site)=>atlasChart(c,id).surveyed.includes(site);
export function atlasSummary(c){
  const charts=explorations.map(d=>atlasChart(c,d.id));
  return {surveyed:charts.reduce((n,r)=>n+Math.max(r.surveyed.length,r.legacySurveyed),0),full:charts.filter(r=>r.surveyed.length===8).length,returns:charts.reduce((n,r)=>n+r.returns,0)};
}
export function researchChartRequirement(c,tech){return tech.charts?.[c.tech[tech.id]||0]||0;}
export function bankExploration(g){
  const c=g.campaign,op=g.operation,atlas=migrateAtlas(c),old=atlasChart(c,op.id),surveyed=[...new Set([...old.surveyed,...g.sites.filter(s=>s.cleared).map(s=>s.id)])];
  const newSurveys=surveyed.filter(id=>!old.surveyed.includes(id)).length,chartReward=surveyed.length===8&&!old.fullRewarded,choices={...old.choices};
  for(const d of c.decisions)if(g.sites[d.site].cleared)choices[g.catalog[d.site].id]=d.option;
  atlas.charts[op.id]={seen:[...new Set([...old.seen,...op.visible])],surveyed,choices,returns:old.returns+1,fullRewarded:old.fullRewarded||chartReward,legacySurveyed:old.legacySurveyed};
  return {newSurveys,chartSurveyed:surveyed.length,chartReward};
}
