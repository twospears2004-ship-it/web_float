// Isolated blocked-water benchmark, not normal campaign or human FPS evidence.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createCampaign,build,damageEnemy,enemyStats} from '../src/game.js';
import {launchMission} from '../src/campaign.js';
import {recruitUnit,orderUnits,tickFleet} from '../src/fleet.js';
const tag=process.argv.find(a=>a.startsWith('--tag='))?.slice(6)||'current';
if(!/^[a-z-]+$/.test(tag))throw new Error('Invalid output tag');
const g=createCampaign('destination');g.resources=1000;build(g,'shipyard',1,0);recruitUnit(g,'skiff');launchMission(g,'coral-1');
const u=g.fleet.units[0];Object.assign(u,{x:25,z:50});
g.enemies=Array.from({length:16},(_,i)=>({id:`block-${i}`,type:'nest',hp:100,x:50+Math.cos(i*Math.PI/8)*10,z:50+Math.sin(i*Math.PI/8)*10}));
orderUnits(g,[u.id],'move',{x:50,z:50});
let replans=0;const start=performance.now();
for(let i=0;i<60;i++){tickFleet(g,1/60,damageEnemy,enemyStats);if(Math.abs(u.repath-0.75)<1e-8)replans++;}
const report={date:new Date().toISOString(),kind:'isolated closed-water rule benchmark',simulatedSeconds:1,ticks:60,replans,elapsedMs:performance.now()-start,sourceHash:createHash('sha256').update(await fs.readFile('src/fleet.js')).digest('hex'),position:{x:u.x,z:u.z},note:'Funded and positioned rule fixture; no campaign, human playtime or rendered FPS claim.'};
await fs.writeFile(`artifacts/fleet-navigation-${tag}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
