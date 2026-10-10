import {test,expect} from '@playwright/test';

const snapshot=page=>page.evaluate(()=>window.__TIDEHOLD__.snapshot());
async function setup(page,mode='direct') {
  await page.clock.install();
  await page.goto('/');
  await page.locator(`[data-start="${mode}"]`).click();
}

test('WASD moves the island in the harbor without starting an expedition',async({page})=>{
  await setup(page);
  for(const [key,axis,sign] of [['w','z',-1],['a','x',-1],['s','z',1],['d','x',1]]) {
    const before=(await snapshot(page)).island[axis];
    await page.keyboard.down(key);await page.clock.runFor(1000);await page.keyboard.up(key);
    const g=await snapshot(page);
    expect((g.island[axis]-before)*sign).toBeGreaterThan(8);
    expect(g.campaign.stage).toBe('harbor');expect(g.resources).toBe(150);expect(g.enemies).toEqual([]);
    const stopped=g.island;await page.clock.runFor(1000);expect((await snapshot(page)).island).toEqual(stopped);
  }
});

test('physical WASD survives Korean IME and a changed key value on release',async({page})=>{
  await setup(page);
  const canvas=page.locator('#scene canvas');
  for(const [code,key,axis,sign] of [['KeyW','ㅈ','z',-1],['KeyA','ㅁ','x',-1],['KeyS','ㄴ','z',1],['KeyD','ㅇ','x',1]]) {
    const before=(await snapshot(page)).island[axis];
    // Browser input events only: model state is observed, never injected.
    await canvas.dispatchEvent('keydown',{key:'Process',code,isComposing:true,bubbles:true});
    await page.clock.runFor(1000);
    await canvas.dispatchEvent('keyup',{key,code,bubbles:true});
    const g=await snapshot(page);expect((g.island[axis]-before)*sign).toBeGreaterThan(8);
    await page.clock.runFor(1000);expect((await snapshot(page)).island).toEqual(g.island);
  }
  await page.keyboard.press('p');const paused=(await snapshot(page)).island;
  await canvas.dispatchEvent('keydown',{key:'ㅈ',code:'KeyW',bubbles:true});
  await page.clock.runFor(1000);await canvas.dispatchEvent('keyup',{key:'w',code:'KeyW',bubbles:true});
  expect((await snapshot(page)).island).toEqual(paused);
});
