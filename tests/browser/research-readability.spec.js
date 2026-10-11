import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {researchContrast} from '../../scripts/research-contrast.mjs';
const state=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());

test('locked and completed research keep readable effects, prices and requirements at desktop and narrow widths without charging',async({page})=>{
  const errors=[],samples=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-12T07:00:00Z')});await page.clock.pauseAt(new Date('2026-10-12T08:00:00Z'));await page.goto('/');await page.locator('[data-start="destination"]').click();
  for(const kind of ['locked','completed']){
    if(kind==='completed'){await page.locator('#save-file').setInputFiles('tests/fixtures/field-control-earned-harbor.json');await page.locator('#resume-button').click();}
    await page.locator('[data-tab="campaign"]').click();const before=await state(page),card=page.locator('[data-research="cryodynamics"]');await expect(card).toBeDisabled();
    await expect(card).toContainText(kind==='locked'?'자료 6 · 자원 2200':'완료');await expect(card).toContainText(kind==='locked'?'0/3':'3/3');
    for(const width of [1440,720]){
      await page.setViewportSize({width,height:900});await card.scrollIntoViewIfNeeded();
      const rows=await card.evaluate(researchContrast);
      for(const row of rows){expect(row.contrast,row.text).toBeGreaterThanOrEqual(4.5);expect(row.opacity,row.text).toBe(1);expect(row.inside,row.text).toBe(true);expect(row.wrapped,row.text).toBe(true);}
      samples.push({kind,width,rows});await page.screenshot({path:`artifacts/research-readability-${kind}-${width}.png`});
    }
    expect(await state(page)).toEqual(before);
  }
  expect(errors).toEqual([]);await fs.writeFile('artifacts/research-readability-ui.json',JSON.stringify({samples,errors,scope:'Public new start and unchanged normally paid harbor import. Actual computed text/background contrast, full opacity and wrapping. Virtual time, no purchase or save payload edits.'},null,2));
});
