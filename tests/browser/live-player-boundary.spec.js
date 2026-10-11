import {test,expect} from '@playwright/test';
import {livePlayer} from '../../scripts/live-player.mjs';

test('a real earned overlapping contact records the visible neighbour actually attacked',async({page})=>{
  // Byte-for-byte owned terminal save: old frozen 15d7, run12, 128 completed
  // operations. Real clock and public file/select/pointer controls only.
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('[data-start="destination"]').click();await page.locator('#save-file').setInputFiles('tests/fixtures/live-earned-relic-overlap.json');
  const player=livePlayer(page,{}),before=await player.state(),hidden=before.enemies.find(e=>e.id==='relic-3-w20-6'),front=before.enemies.find(e=>e.id==='relic-3-w20-7'),ids=before.fleet.units.filter(u=>u.hp>0&&u.type!=='tender').map(u=>u.id);
  expect(Math.hypot(hidden.x-front.x,hidden.z-front.z)).toBeLessThan(1);await page.locator('#resume-button').click();expect(await player.order('attack',hidden,ids)).toBe(true);
  const after=await player.state(),orders=after.fleet.units.filter(u=>ids.includes(u.id)&&u.hp>0).map(u=>u.command);expect(orders.length).toBeGreaterThan(0);expect(orders.every(c=>c.type==='attack'&&c.target===front.id)).toBe(true);expect(after.checkpoint).toEqual(before.checkpoint);expect(after.resources).toBeGreaterThanOrEqual(before.resources);expect(errors).toEqual([]);
});

test('a genuine survey choice disabled after readiness remains unspent and recoverable',async({page})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/',{waitUntil:'domcontentloaded'});await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/live-earned-survey-transition.json');await page.locator('#resume-button').click();
  await page.locator('[data-tab="voyage"]').click();
  const selector='[data-field-choice="calibrate"]';await expect(page.locator(selector)).toBeVisible();await expect(page.locator(selector)).toBeEnabled();const player=livePlayer(page,{}),before=await player.state();
  expect(before.campaign.pendingChoice).toEqual({site:2,kind:'ammunition'});
  const boundaryPage=new Proxy(page,{get(target,key){
    if(key==='locator')return (...args)=>{
      const locator=target.locator(...args);if(args[0]!==selector)return locator;
      return new Proxy(locator,{get(l,key){
        if(key==='click')return async options=>{await page.keyboard.press('p');return l.click({...options,timeout:1000});};
        const value=Reflect.get(l,key);return typeof value==='function'?value.bind(l):value;
      }});
    };
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  expect(await livePlayer(boundaryPage,{}).tap(selector)).toBe(false);await expect(page.locator('#pause-overlay')).toBeVisible();
  const after=await player.state();expect(after.resources).toBe(before.resources);expect(after.fleet).toEqual(before.fleet);expect(after.campaign.pendingChoice).toEqual(before.campaign.pendingChoice);
  await page.locator('#resume-button').click();await expect(page.locator(selector)).toBeEnabled();expect(await player.tap(selector)).toBe(true);
  expect((await player.state()).campaign.pendingChoice).toBe(null);expect((await player.state()).resources).toBeLessThan(before.resources);expect(errors).toEqual([]);
});

test('actual result and a pause between observation and selection stop automated fleet commands',async({page})=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/',{waitUntil:'domcontentloaded'});await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/endgame-earned-coral-network-result.json');
  await expect(page.locator('#end-overlay')).toBeVisible();
  const player=livePlayer(page,{}),earned=await player.state(),start=Date.now();
  expect(await player.order('escort')).toBe(false);expect(await player.tap('[data-tab="fleet"]')).toBe(false);
  expect(Date.now()-start).toBeLessThan(2000);expect((await player.state()).fleet).toEqual(earned.fleet);await expect(page.locator('#end-overlay')).toBeVisible();
  await page.locator('#retry-button').click();const before=await player.state();let pauseOnce=true;
  // Read the genuine playing snapshot, then press the real pause shortcut before
  // the controller's following action. No game setter or fabricated state.
  const boundaryPage=new Proxy(page,{get(target,key){
    if(key==='evaluate')return async(...args)=>{const observed=await target.evaluate(...args);if(pauseOnce){pauseOnce=false;await target.keyboard.press('p');}return observed;};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const raced=livePlayer(boundaryPage,{}),raceStart=Date.now();expect(await raced.order('hold')).toBe(false);
  expect(Date.now()-raceStart).toBeLessThan(2000);await expect(page.locator('#pause-overlay')).toBeVisible();expect((await player.state()).fleet).toEqual(before.fleet);expect(errors).toEqual([]);
});

test('a fleet command skips the genuinely lost ship in an earned active siege save',async({page})=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('/',{waitUntil:'domcontentloaded'});await page.locator('[data-start="destination"]').click();
  await page.locator('#save-file').setInputFiles('tests/fixtures/live-earned-coral-siege-casualty.json');await expect(page.locator('#pause-overlay')).toBeVisible();
  // Only rendering time is frozen for this UI regression. The fixture is the
  // unchanged normal-cost, actual-time campaign save from its own profile.
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));await page.locator('#resume-button').click();
  const player=livePlayer(page,{}),before=await player.state();expect(before.fleet.units.filter(u=>u.hp<=0).map(u=>u.id)).toEqual([1]);
  expect(await player.order('hold',undefined,before.fleet.units.map(u=>u.id))).toBe(true);
  const after=await player.state();expect(after.fleet.units.filter(u=>u.hp>0).every(u=>u.command.type==='hold')).toBe(true);expect(after.fleet.units.find(u=>u.id===1).hp).toBe(0);expect(after.resources).toBe(before.resources);expect(errors).toEqual([]);
});
