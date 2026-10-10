// Original oscillator sounds; no downloaded music, files, API calls or asset keys.
export class GameAudio {
  constructor(settings) { this.settings = settings; this.context = null; this.lastShot = 0; this.nextMusic = 0; this.note = 0; this.paused = true; }
  async unlock() {
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) return;
        this.context = new AudioContext(); this.master = this.context.createGain(); this.master.gain.value = 0;
        this.master.connect(this.context.destination); this.sfx = this.context.createGain(); this.music = this.context.createGain(); this.sfx.connect(this.master); this.music.connect(this.master);
      }
      await this.context.resume(); this.apply();
    } catch { /* Silent fallback when the browser disallows audio. */ }
  }
  apply() { if (!this.context) return; this.sfx.gain.value = this.settings.effects; this.music.gain.value = this.settings.music; this.master.gain.setTargetAtTime(this.paused ? 0 : 0.42, this.context.currentTime, 0.05); }
  tone(frequency, duration, type, volume, channel = 'sfx', endFrequency = null) {
    const c = this.context; if (!c || c.state !== 'running' || this.paused) return;
    const oscillator = c.createOscillator(), gain = c.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency,c.currentTime);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency,c.currentTime+duration);
    gain.gain.setValueAtTime(Math.max(0.0001,volume),c.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+duration);
    oscillator.connect(gain); gain.connect(this[channel]); oscillator.start(); oscillator.stop(c.currentTime+duration);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  event(e) {
    if (!this.context || this.paused || this.settings.effects <= 0) return;
    const t=this.context.currentTime;
    if (e.type==='shot' && t-this.lastShot>0.07) { this.lastShot=t; this.tone(e.weapon==='mortar'?95:220,0.09,'triangle',0.13,'sfx',42); }
    if (e.type==='enemyShot') this.tone(65,0.14,'sawtooth',0.035,'sfx',30);
    if (e.type==='kill') { this.tone(420,0.24,'sine',0.06,'sfx',730); }
    if (e.type==='build') this.tone(520,0.18,'triangle',0.07,'sfx',820);
    if (e.type==='production') this.tone(580,0.18,'sine',0.05,'sfx',760);
    if (e.type==='research') this.tone(740,0.22,'triangle',0.05,'sfx',980);
    if (e.type==='warning') this.tone(270,0.45,'sine',0.07,'sfx',160);
    if (e.type==='missionComplete' || e.type==='clear') for(let i=0;i<3;i++) this.tone([261.63,329.63,392][i],0.8,'sine',0.04);
  }
  update(paused) {
    const changed=this.paused!==paused;this.paused=paused;if(changed)this.apply();
    if (!this.context || this.context.state!=='running' || paused || !this.settings.music) return;
    const t=this.context.currentTime; if(t<this.nextMusic)return; this.nextMusic=t+2.4;
    const notes=[130.81,164.81,196,146.83,174.61,220,164.81,196];
    const note=notes[this.note++%notes.length]; this.tone(note,3.5,'sine',0.085,'music'); this.tone(note*2,2.8,'sine',0.027,'music');
  }
}
export const SETTINGS_KEY='tidehold.settings.v1';
export function loadSettings(storage=globalThis.localStorage) {
  const fallback={effects:0.6,music:0.22,graphics:'standard'};
  try { const s=JSON.parse(storage.getItem(SETTINGS_KEY)); if(s && ['effects','music'].every(k=>Number.isFinite(s[k]) && s[k]>=0 && s[k]<=1) && ['standard','low'].includes(s.graphics))return s; } catch { /* Defaults preserve a working game. */ }
  return fallback;
}
