// Diagnose the saved, normally earned defense tail with a real fleet command.
import fs from 'node:fs/promises';
import {advance,enemyStats} from '../src/game.js';
import {orderUnits} from '../src/fleet.js';
import {unitTypes} from '../src/fleet-content.js';
import {defenseTarget} from '../src/fortifications.js';
import {decodeSave,encodeSave} from '../src/save.js';
const g=decodeSave(await fs.readFile('artifacts/journey-stalled-defense-ember-3.json','utf8'));g.paused=false;
const target=g.enemies.find(e=>e.hp>0),before={seconds:g.campaign.missionSeconds,shots:g.shots,round:g.operation.round};
const fighters=g.fleet.units.filter(u=>u.hp>0&&unitTypes[u.type].damage>0).map(u=>u.id);
console.log(JSON.stringify({enemy:target,stats:enemyStats(g,target),defenseTarget:defenseTarget(g,target),fighters}));
if(!orderUnits(g,fighters,'attack',{id:target.id}))throw new Error('Fleet attack could not be ordered');
for(let i=0;i<180*60&&!g.operation.waiting&&g.phase==='playing';i++)advance(g,1/60);
decodeSave(encodeSave(g));const report={kind:'normal fleet attack on a continuous-earned ranged defense tail',seconds:g.campaign.missionSeconds-before.seconds,shots:g.shots-before.shots,enemyHp:g.enemies.find(e=>e.id===target.id).hp,nextRound:g.operation.round,waiting:g.operation.waiting,phase:g.phase};
await fs.writeFile('artifacts/defense-ranged-tail.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!g.operation.waiting||g.operation.round!==before.round+1)throw new Error('The ranged tail did not clear with a normal attack order');
