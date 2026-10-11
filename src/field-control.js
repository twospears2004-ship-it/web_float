import {campaignRules,abilityDefinitions} from './campaign-content.js';

// One source for the paid control effects, previews and rendered pulse radius.
export function coolingStats(level=0) {
  const frost=campaignRules.weapons.frost;
  return {frostSplash:frost.splash+level,frostSlow:(frost.slow*100-level*5)/100,pulseRange:abilityDefinitions.pulse.range+level*2};
}
