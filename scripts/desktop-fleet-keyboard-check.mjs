import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {decodeSave} from '../src/save.js';
import {unitUpgradeCost} from '../src/fleet.js';
const pkg=JSON.parse(await fs.readFile('artifacts/desktop-package.json','utf8'));
const profile=path.resolve('artifacts/desktop-profiles',`fleet-keyboard-${Date.now()}`);await fs.mkdir(profile,{recursive:true});
const env={...process.env,TIDEHOLD_TEST_MODE:'1',TIDEHOLD_PROFILE_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];const started=Date.now();
try{
  app=await electron.launch({executablePath:pkg.executable,args:[],env,timeout:60000});const page=await app.firstWindow();
  page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');
  assert.equal(await page.evaluate(()=>!!window.__TIDEHOLD__),false);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  await page.locator('[data-start="direct"]').click();await page.locator('#save-file').setInputFiles('tests/fixtures/walls-legacy-coral-harbor.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="fleet"]').click();await page.locator('#build-shipyard').click();await page.locator('[data-tile="-1,0"]').click();
  await page.locator('[data-tab="fleet"]').click();for(let i=0;i<3;i++)await page.locator('[data-recruit="skiff"]').click();
  const first=page.locator('[data-unit-select="1"]'),second=page.locator('[data-unit-select="2"]');
  await first.focus();await page.keyboard.press('Enter');await expect(first).toBeFocused();
  await second.focus();await page.keyboard.press('Shift+Enter');await expect(second).toBeFocused();
  await expect(page.locator('#selection-count')).toHaveText('선택 2');
  const upgrade=page.locator('[data-unit-upgrade="1"]');await upgrade.focus();await page.keyboard.press('Enter');
  await expect(upgrade).toBeDisabled();await expect(first).toBeFocused();await expect(first).toContainText('2단계');
  await page.keyboard.press('Control+5');await expect(page.locator('[data-control-group="5"] [data-group-count]')).toHaveText('2기');
  await page.screenshot({path:'artifacts/fleet-keyboard-native.png'});
  const ended=app.waitForEvent('close',{timeout:20000});await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),10);});await ended;app=null;
  const saved=decodeSave(await fs.readFile(path.join(profile,'saves/campaign.json'),'utf8'));
  assert.equal(saved.fleet.units.length,3);assert.equal(saved.fleet.units[0].level,2);assert.equal(saved.fleet.units[1].level,1);
  assert.equal(saved.resources,406-unitUpgradeCost({...saved.fleet.units[0],level:1}));assert.deepEqual(saved.fleet.groups['5'],[1,2]);assert.deepEqual(errors,[]);
  const report={date:new Date().toISOString(),executable:pkg.executable,profile,gameBundle:pkg.gameBundle,realSeconds:(Date.now()-started)/1000,noDevHooks:true,noVirtualClock:true,resources:saved.resources,group:saved.fleet.groups['5'],errors,passed:true};
  await fs.writeFile('artifacts/fleet-keyboard-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(app)await app.close();}

