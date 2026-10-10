import './style.css';
import { GameView } from './view.js';
import { balance, createGame, createCampaign, advance, build, expand, expansionCost, upgrade, repair, collectProduction, demolish, moveFacility, setRoute, startEncounter, setTargeting, weaponStats, enemyStats, upgradeCost, canManage, expansionSlots, keyOf, distance, rulesFor, sitesFor } from './game.js';
import {productionStats,atShore,productionTypes} from './production.js';
import {unitTypes,fleetRules} from './fleet-content.js';
import {recruitUnit,upgradeUnit,unitUpgradeCost,unitStats,fleetCapacity,fleetSupply,repairFleet,fleetRepairCost,orderUnits,dismissUnit,controlGroupNumbers,controlGroupUnits,assignControlGroup} from './fleet.js';
import {structureHull,structureRepairCost,repairStructure} from './fortifications.js';
import {wallEdges,wallEdge,wallAt} from './walls.js';
import {getOperation,defenseContracts,defensePatterns} from './frontier-content.js';
import {siegeContracts,siegePatterns,basePower} from './siege-content.js';
import {explorations} from './exploration-content.js';
import {atlasChart,atlasSummary,atlasHasSurvey,researchChartRequirement} from './atlas.js';
import {atlasMarkup} from './atlas-view.js';
import {selectExplorationSite,finishExploration,knownSite,canExtract,isExploring} from './exploration.js';
import {launchDefense,startDefenseWave,retryDefense,availableDefenses,availableSieges,availableExplorations} from './frontier.js';
import { chapters, missions, getMission, getChapter, technologies, abilityDefinitions, bossTactics, enemyTactics } from './campaign-content.js';
import { launchMission, returnToHarbor, retryMission, availableMissions, useAbility, repairEscort, resupplyAbilities, researchTechnology, researchCost, powerCapacity, powerUsed, facilityPower, currentFieldDecision, resolveFieldDecision } from './campaign.js';
import { saveCampaign, loadCampaign, encodeSave, decodeSave, SAVE_KEY } from './save.js';
import {createDesktopBridge} from './desktop-bridge.js';
import {createRenderCadence} from './render-cadence.js';
import { GameAudio, loadSettings, SETTINGS_KEY } from './audio.js';

const icon = (name) => ({ cannon: '↗', mortar: '◉', rail: '⌁', frost: '❄', shield: '◇', workshop: '✚', crane:'⚒',fishery:'≈',farm:'♧',laboratory:'⚗',shipyard:'⚓',wall:'▥',mine:'✹',expand: '⊞', repair: '✚', core: '⌂' }[name]);
const app = document.querySelector('#app');
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Tidehold 시작 화면"><span class="brand-mark">✦</span><span>TIDEHOLD<small>떠도는 섬</small></span></a>
    <div class="top-stats"><span class="resource-icon">◆</span><div><small>회수 자원</small><strong id="resources">120</strong></div><div class="stat-divider"></div><div class="hull-stat"><small>섬 내구도 <span id="hull-label"></span></small><div class="meter"><i id="hull-fill"></i></div></div></div>
    <nav><span id="mode-label" class="mode-chip">실시간 조종</span><button id="settings-button" class="icon-button" title="소리와 그래픽 설정" aria-label="소리와 그래픽 설정">⚙</button><button id="help-button" class="icon-button" title="조작 안내" aria-label="조작 안내">?</button><button id="pause-button" class="icon-button" title="일시정지 (P)" aria-label="일시정지">Ⅱ</button><button id="restart-button" class="text-button">다시 시작</button></nav>
  </header>
  <main class="layout">
    <section class="viewport" aria-label="해상 탐험">
      <div id="scene"></div>
      <div class="scene-heading"><span class="eyebrow">THE OPEN SEA</span><h1 id="scene-title">나의 섬, 다음 항해.</h1><p id="objective">시설을 준비하고 산호 여울로 향하세요.</p></div>
      <div class="sea-status"><span id="phase-dot"></span><span id="sea-state">정박 · 정비 가능</span></div>
      <div class="compass"><span>N</span><span class="compass-arrow">↑</span><small>북쪽</small></div>
      <div id="tool-tip" class="tool-tip" hidden></div>
      <div id="selection-box" class="selection-box" hidden></div>
      <div id="fleet-toolbar" class="fleet-toolbar" hidden><button id="command-toggle" aria-pressed="false">Q 함대 선택</button><span id="selection-count">선택 0</span><button data-order="escort" title="G · 섬 호위">호위</button><button data-order="hold" title="H · 위치 사수">사수</button><button id="attack-move" aria-pressed="false" title="X · 다음 우클릭으로 공격 이동">공격 이동</button><button id="fleet-focus" title="C · 선택 함대 / 섬 시점 전환">함대 시점</button></div>
      <div class="map-panel"><div class="map-title"><span>해역 지도</span><small>고정 시나리오 01</small></div><canvas id="minimap" width="230" height="180" aria-label="정박지와 세 전투 위치 지도"></canvas><div class="map-legend"><span>● 나의 섬</span><span>◇ 미탐사</span><span>✓ 정리</span></div></div>
      <div class="sea-bottom"><div class="hint-key" id="controls-hint">W A S D 이동 <span>·</span> 휠 확대 <span>·</span> 타일 클릭 배치</div><button id="mode-button" class="glass-button">⇄ 이동 방식 비교</button></div>
      <div id="floating-label" class="floating-label" hidden></div>
      <div id="mission-hud" class="mission-hud" hidden><strong id="mission-name"></strong><p id="mission-progress"></p><div id="ally-hud" hidden></div><div id="boss-hud" hidden></div></div>
      <div id="ability-bar" class="ability-bar" hidden>${Object.entries(abilityDefinitions).map(([id,a]) => `<button data-ability="${id}" title="${a.description}"><kbd>${a.key}</kbd><strong>${a.name}</strong><span data-cooldown="${id}">준비</span></button>`).join('')}</div>
    </section>
    <aside class="sidebar" aria-label="섬 정비와 탐험">
      <div class="sidebar-tabs"><button class="active" data-tab="build">섬 정비</button><button data-tab="voyage">해역 <span id="cleared-count">0/3</span></button><button data-tab="fleet" hidden>함대</button><button data-tab="campaign" hidden>캠페인</button><button data-tab="atlas" hidden>기록</button></div>
      <div id="build-panel" class="tab-panel">
        <div class="section-heading"><span class="eyebrow">BUILD & GROW</span><h2>다음 항해를 준비하세요</h2><p>무장 · 생산 · 연구로 섬을 키우세요.</p></div>
        <div class="build-actions">
          <button class="build-card" data-tool="cannon"><span class="facility-icon cannon">↗</span><span><strong>연사포</strong><small>빠른 단일 공격</small></span><em>◆ 65</em></button>
          <button class="build-card" data-tool="mortar"><span class="facility-icon mortar">◉</span><span><strong>박격포</strong><small>느린 범위 공격</small></span><em>◆ 100</em></button>
          ${['frost','rail','shield','workshop'].map(type => `<button class="build-card campaign-weapon" data-tool="${type}" hidden><span class="facility-icon ${type}">${icon(type)}</span><span><strong></strong><small></small></span><em></em></button>`).join('')}
          <p id="production-heading" class="production-heading" hidden>자원 · 생산 · 연구 시설</p>
          ${productionTypes.map(type => `<button class="build-card campaign-weapon" data-tool="${type}" hidden><span class="facility-icon ${type}">${icon(type)}</span><span><strong></strong><small></small></span><em></em></button>`).join('')}
          <button class="build-card campaign-weapon" data-tool="shipyard" hidden><span class="facility-icon shipyard">⚓</span><span><strong></strong><small></small></span><em></em></button>
          ${['wall','mine'].map(type=>`<button class="build-card campaign-weapon" data-tool="${type}" hidden><span class="facility-icon ${type}">${icon(type)}</span><span><strong></strong><small></small></span><em></em></button>`).join('')}
          <div class="utility-row"><button data-tool="expand">⊞ 섬 확장 <small>◆ 45</small></button><button id="repair-button">✚ 수리 <small>◆ 30</small></button></div>
          <button id="show-designs" class="design-toggle" hidden>잠긴 설계도 보기</button>
        </div>
        <button id="board-toggle" class="design-toggle" aria-expanded="false" aria-controls="placement-panel">배치도로 시설 선택</button>
        <div id="placement-panel" hidden><div class="board-heading"><strong id="placement-label">건설 타일 선택</strong><button id="cancel-tool" class="text-button">취소 Esc</button></div><div id="wall-side-picker" hidden><span>타일을 클릭할 때 설치할 면</span><div>${Object.entries(wallEdges).map(([edge,s])=>`<button data-edge-choice="${edge}" aria-pressed="false">${s.name}</button>`).join('')}</div></div><div id="tile-board" class="tile-board" aria-label="섬 건설 배치도"></div><small class="board-help">위쪽이 북쪽 · 타일 안쪽은 시설, 테두리는 성벽입니다. 성벽은 같은 타일의 농장·포탑과 함께 건설할 수 있습니다.</small></div>
        <div id="facility-panel" class="facility-panel"></div>
        <div class="loop-guide"><span class="eyebrow">YOUR FIRST VOYAGE</span><ol><li><b>01</b><span>박격포를 건설하거나 연사포 강화</span></li><li><b>02</b><span>산호 여울에서 적을 처치</span></li><li><b>03</b><span>자원으로 섬 확장 · 다음 적에게</span></li></ol><button id="show-voyage" class="primary-button">탐험 항로 보기 <span>→</span></button></div>
      </div>
      <div id="voyage-panel" class="tab-panel" hidden>
        <div class="section-heading"><span class="eyebrow">CHOOSE YOUR HORIZON</span><h2>다음 목적지</h2><p id="voyage-note"></p></div>
        <p id="operation-report" class="operation-report" hidden></p><div id="field-choice" class="field-choice" hidden aria-live="polite"></div>
        <div id="field-repairs" class="utility-row" hidden><button id="field-repair">섬 현장 수리 <small>◆ 35</small></button><button id="escort-repair">호위선 수리 <small>◆ 40</small></button><button id="field-resupply">능력 재보급 <small>◆ 75</small></button></div>
        <label id="route-toggle" class="route-toggle" hidden><input id="show-route" type="checkbox" /> 전체 원정 경로 보기</label>
        <div id="site-list"></div><div id="enemy-intel" class="enemy-intel" hidden></div>
        <button id="home-button" class="home-button">⌂ 정박지로 귀환</button>
        <p class="voyage-footnote">두 모드의 적 · 자원 · 비용은 같습니다.<br/>다시 시작하면 모든 조건이 초기화됩니다.</p>
      </div>
      <div id="campaign-panel" class="tab-panel" hidden><div class="section-heading"><span class="eyebrow">THE LONG VOYAGE</span><h2 id="chapter-title"></h2><p id="campaign-progress"></p></div><p id="chapter-briefing" class="chapter-briefing"></p><div id="mission-list"></div><div id="research-panel"><h3>연구소 <span id="research-points"></span></h3><div id="research-list"></div></div><div class="save-tools"><span id="save-status" role="status">자동 저장 대기</span><button id="save-button">지금 저장</button><button id="export-save">파일로 내보내기</button><button id="import-save">저장 파일 불러오기</button><input id="save-file" type="file" accept=".json,application/json" hidden /></div></div>
      <div id="fleet-panel" class="tab-panel" hidden><div class="section-heading"><span class="eyebrow">COMMAND YOUR FLEET</span><h2>함대를 지휘하세요</h2><p>조선소에서 생산한 배는 출항에 함께합니다. 클릭·드래그로 선택하고 우클릭으로 이동·공격하세요.</p></div><p id="fleet-capacity"></p><button id="build-shipyard" class="primary-button">조선소 건설 ◆ 120</button><div id="recruit-list">${Object.entries(unitTypes).map(([type,u])=>`<button class="build-card" data-recruit="${type}"><span class="facility-icon">${u.icon}</span><span><strong>${u.name}</strong><small>${u.description}</small></span><em>◆ ${u.cost}</em></button>`).join('')}</div><div class="utility-row"><button id="select-all-units">F 전체 선택</button><button id="repair-fleet">함대 수리</button></div><div id="unit-list"></div><p class="board-help">Q 선택 모드 · Shift 추가 선택 · X 공격 이동 · H 사수 · G 섬 호위 · C 시점 전환. Alt+우클릭 드래그로 회전합니다. 지도 클릭으로 먼 곳을 봅니다.</p></div>
      <div class="sidebar-footer"><span>싱글플레이 PvE</span><span>LOCAL / TIDEHOLD</span></div>
    </aside>
  </main>
  <footer class="eventbar"><span class="event-icon">◇</span><p id="message" role="status" aria-live="polite"></p><span id="kill-count">격파 0</span></footer>
  <div id="start-overlay" class="overlay">
    <div class="start-dialog" role="dialog" aria-modal="true" aria-labelledby="start-title">
      <span class="eyebrow">A VOYAGE BEYOND THE HORIZON</span><div class="start-emblem">✦</div><h1 id="start-title">TIDEHOLD</h1><p class="start-subtitle">작은 섬에서, 더 먼 바다로.</p>
      <p class="start-description">무장·생산·연구 시설로 나만의 섬을 키우세요.<br/>바다에서 회수한 자원으로 더 먼 항해를 준비합니다.</p>
      <button id="continue-button" class="continue-button" hidden>저장한 항해 이어하기</button>
      <div class="experience-selector"><button class="active" data-experience="campaign">새 캠페인 <small>성장 · 임무 · 자동 저장</small></button><button data-experience="training">비교 훈련 <small>같은 조건의 짧은 3전투</small></button></div>
      <div class="mode-options"><button data-start="direct"><span class="mode-number">A / HELM</span><strong>실시간 조종</strong><p>WASD로 섬을 움직입니다.<br/>교전 중에도 기동할 수 있습니다.</p><span class="mode-cta">직접 항해하기 →</span></button><button data-start="destination"><span class="mode-number">B / ROUTE</span><strong>목적지 선택</strong><p>항로를 선택해 자동 항해합니다.<br/>교전 위치가 고정됩니다.</p><span class="mode-cta">항로 선택하기 →</span></button></div>
      <small class="comparison-note">같은 초기 섬 · 같은 적 배치 · 같은 보상<br/>모드 선택 시 새 원정으로 시작합니다.</small>
    </div>
  </div>
  <div id="pause-overlay" class="overlay" hidden><div class="compact-dialog" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span class="eyebrow">TAKE A BREATH</span><h2 id="pause-title">항해를 잠시 멈춥니다</h2><p>시간과 전투가 모두 정지되어 있습니다.</p><button id="resume-button" class="primary-button">계속 항해하기</button><button class="secondary-button" id="pause-mode">이동 방식 변경 · 새 원정</button></div></div>
  <div id="end-overlay" class="overlay" hidden><div class="compact-dialog" role="dialog" aria-modal="true" aria-labelledby="end-title"><span class="eyebrow" id="end-eyebrow"></span><h2 id="end-title"></h2><p id="end-description"></p><div id="end-stats" class="end-stats"></div><button id="retry-button" class="primary-button">같은 조건으로 다시 도전</button><button id="compare-button" class="secondary-button">다른 이동 방식으로 비교</button></div></div>
  <div id="help-overlay" class="overlay" hidden><div class="compact-dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><span class="eyebrow">FIELD NOTES</span><h2 id="help-title">항해 안내</h2><dl><dt>실시간 조종</dt><dd>WASD / 방향키로 이동. W·↑는 지도 북쪽입니다. 전투 중 이동도 가능합니다.</dd><dt>목적지 선택</dt><dd>탐험 항로에서 출항. 자동 항해 후 위치를 고정하고 싸웁니다. 교전 중 다른 목적지로 떠날 수 없습니다.</dd><dt>섬 정비</dt><dd>시설 선택 → 빈 타일 클릭. 확장은 황금빛 가장자리 타일을 선택하세요. 기존 시설을 선택하면 강화·무료 재배치·철거가 가능합니다.</dd><dt>자동 전투</dt><dd>무장은 자신의 위치에서 사거리 내 적을 자동 공격합니다. 처치 즉시 자원을 받습니다. 전투·자동 항해 중 정비는 잠깁니다.</dd><dt>시점과 반복</dt><dd>휠로 확대·축소, 마우스 오른쪽 드래그로 회전. P 일시정지, Esc 배치 취소 또는 일시정지. 다시 시작은 자원·섬·적을 모두 초기화합니다.</dd></dl><p>저장은 없는 비교용 프로토타입입니다. 새로고침하면 시작 화면으로 돌아옵니다.</p><button id="close-help" class="primary-button">알겠습니다</button></div></div>
  <div id="replace-overlay" class="overlay" hidden><div class="compact-dialog" role="dialog" aria-modal="true" aria-labelledby="replace-title"><span class="eyebrow">NEW VOYAGE</span><h2 id="replace-title">새 캠페인을 시작할까요?</h2><p>현재 저장한 캠페인이 새 항해로 교체됩니다. 계속 진행하려면 돌아가서 이어하기를 선택하세요.</p><button id="confirm-new" class="primary-button">새 캠페인 시작</button><button id="cancel-new" class="secondary-button">돌아가기</button></div></div>
  <div id="settings-overlay" class="overlay" hidden><div class="compact-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><span class="eyebrow">MAKE IT YOUR SEA</span><h2 id="settings-title">소리와 화면</h2><label class="settings-row">효과음 <input id="effects-volume" type="range" min="0" max="1" step="0.05" /></label><label class="settings-row">배경음 <input id="music-volume" type="range" min="0" max="1" step="0.05" /></label><label class="settings-row">그래픽 <select id="graphics-quality"><option value="standard">표준 · 그림자</option><option value="low">가볍게 · 그림자 끄기</option></select></label><p>음향은 이 게임에서 합성합니다. 볼륨 0은 음소거입니다. 설정은 이 브라우저에 저장됩니다.</p><button id="close-settings" class="primary-button">항해로 돌아가기</button></div></div>
`;
const $ = (id) => document.getElementById(id);
$('campaign-panel').insertAdjacentHTML('beforeend','<div id="frontier-panel"><h3>기지 방어 작전</h3><p class="board-help">시설마다 개별 내구도가 있습니다. 성벽으로 생산 시설을 가리고 함대를 배치하세요. 새 해역의 공세와 방어 기록이 열립니다.</p><div id="defense-list"></div><h3>함대 기지 공략</h3><p class="board-help">조선소와 함대가 필요합니다. 동력망과 지휘핵을 공략해 세 거점을 확보하세요. 보급 창고는 추가 자원입니다.</p><div id="siege-list"></div></div>');
$('voyage-panel').insertAdjacentHTML('afterbegin','<div id="defense-control" class="field-choice" hidden><h3 id="defense-title"></h3><p id="defense-status"></p><button id="start-defense-wave" class="primary-button">공세 시작</button></div>');
$('frontier-panel').insertAdjacentHTML('beforeend','<h3>미지 항로 탐험</h3><p class="board-help">함대로 신호를 발견하고 조사 순서를 고르세요. 필수 기록 3개로 귀환할 수 있습니다. 조사 기록은 여러 원정에 걸쳐 쌓이며 해도 완성 보상은 한 번 지급합니다.</p><div id="exploration-list"></div>');
$('unit-list').insertAdjacentHTML('beforebegin',`<div class="fleet-groups"><h3>전대 편성</h3><div class="fleet-group-list">${controlGroupNumbers.map(number=>`<div><button data-control-group="${number}" aria-label="전대 ${number} 선택" title="${number}: 선택 · 두 번 누르면 시점 이동 · Shift: 추가 선택">${number}<small data-group-count>0기</small></button><button data-group-save="${number}" aria-label="선택 함대를 전대 ${number}에 등록" title="선택한 함선으로 편성 교체 · Shift: 기존 편성에 추가">등록</button></div>`).join('')}</div><p class="board-help">5–9 선택 · Ctrl+숫자 등록 · Ctrl+Shift+숫자 추가 등록. 선택 없이 등록하면 편성을 비웁니다. 능력은 1–4번입니다.</p></div>`);
$('fleet-panel').insertAdjacentHTML('afterend',`<div id="atlas-panel" class="tab-panel" hidden><div class="section-heading"><span class="eyebrow">CHART THE UNKNOWN</span><h2>항로 기록</h2><p>다녀온 바다의 기록이 섬의 다음 성장을 엽니다.</p></div><label class="atlas-filter">기록할 해역<select id="atlas-chapter"><option value="current">현재 해역</option>${chapters.map((ch,i)=>`<option value="${i}">${ch.name}</option>`).join('')}</select></label><div id="atlas-content"></div></div>`);
$('defense-control').insertAdjacentHTML('beforeend','<button id="send-survey" hidden>선택 함대를 조사 지점으로</button><button id="extract-exploration" class="primary-button" hidden>기록을 가지고 귀환</button>');
let game = createGame();
const ui = { started: false, tool: null, selected: null, moving: null, hover: null, tab: 'build', trackedSite: 'shoal', helpWasPaused: false, experience: 'campaign', modeSwitch: false, pendingMode: null, showLocked: false, board:false,selectedUnits:[],commandMode:false,attackMove:false,fleetFocus:false };
ui.edge='north';
const desktop=createDesktopBridge(window.tideholdDesktop,localStorage),desktopRestore=await desktop.restore();
let saved = loadCampaign();
$('continue-button').hidden = !saved.game;
if (saved.game) $('continue-button').textContent = `${saved.recovered ? '백업에서 ' : ''}항해 이어하기 · ${saved.game.campaign.completed.length}/72 임무`;
if (saved.errors.length) $('save-status').textContent = saved.game ? '손상된 저장을 백업에서 복구했습니다.' : '저장 파일을 읽지 못했습니다. 원본은 보존했습니다.';
if(desktopRestore.error)$('save-status').textContent=desktopRestore.error;
if(desktopRestore.restored)$('save-status').textContent=desktopRestore.recovered?'PC 저장 백업에서 복구했습니다.':'PC 저장에서 항해를 복원했습니다.';
const keys = new Set();
const settings = loadSettings(), audio = new GameAudio(settings);
let settingsWasPaused = false;
let view;
try { view = new GameView($('scene')); }
catch (error) {
  $('start-title').textContent = 'WebGL 실행 제한';
  document.querySelector('.start-description').textContent = `3D 화면을 시작하지 못했습니다. WebGL이 가능한 PC 브라우저에서 열어 주세요. ${error.message}`;
  document.querySelector('.mode-options').hidden = true;
  console.error(error);
}
function applySettings() { audio.apply(); if(view) { view.renderer.shadowMap.enabled = settings.graphics!=='low'; view.renderer.setPixelRatio(settings.graphics==='low'?1:Math.min(window.devicePixelRatio,1.75)); view.resize(); } }
applySettings();
$('effects-volume').value=settings.effects; $('music-volume').value=settings.music; $('graphics-quality').value=settings.graphics;
$('settings-button').addEventListener('click',()=>{settingsWasPaused=game.paused;game.paused=true;keys.clear();$('settings-overlay').hidden=false;$('effects-volume').focus();});
$('close-settings').addEventListener('click',()=>{$('settings-overlay').hidden=true;game.paused=settingsWasPaused;$('settings-button').focus();});
for(const id of ['effects-volume','music-volume','graphics-quality'])$(id).addEventListener('input',()=>{settings.effects=Number($('effects-volume').value);settings.music=Number($('music-volume').value);settings.graphics=$('graphics-quality').value;applySettings();try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}});
function showTab(tab) {
  if(ui.tab!==tab)document.querySelector('.sidebar').scrollTop=0;
  ui.tab = tab; $('build-panel').hidden = tab !== 'build'; $('voyage-panel').hidden = tab !== 'voyage'; $('campaign-panel').hidden = tab !== 'campaign';
  $('fleet-panel').hidden=tab!=='fleet';$('atlas-panel').hidden=tab!=='atlas';
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}
function installGame(next, tab = 'build') {
  audio.unlock();
  game = next; view?.reset(); keys.clear(); lastSiteKey = ''; lastCampaignKey = '';
  Object.assign(ui, { started: true, tool: null, selected: null, moving: null, hover: null, trackedSite: 'shoal' });
  Object.assign(ui,{selectedUnits:[],commandMode:false,attackMove:false,fleetFocus:false});
  ui.lastGroup=null;
  $('start-overlay').hidden = true; $('end-overlay').hidden = true; $('pause-overlay').hidden = true; $('help-overlay').hidden = true;
  $('replace-overlay').hidden = true; showTab(tab); update(true); $('pause-button').focus();
  document.querySelector('.sidebar').scrollTop=0;
}
function start(mode, confirmed = false) {
  if (ui.modeSwitch && game.campaign) {
    game.mode = mode; game.paused = false; game.route = null; ui.modeSwitch = false;
    $('start-overlay').hidden = true; update(true); persist(); return;
  }
  if (ui.experience === 'campaign' && loadCampaign().game && !confirmed) { ui.pendingMode = mode; $('replace-overlay').hidden = false; $('confirm-new').focus(); return; }
  installGame(ui.experience === 'campaign' ? createCampaign(mode) : createGame(mode));
  if (game.campaign) { showTab('campaign'); persist(); }
}
function clearTool() { ui.tool = null; ui.moving = null; update(true); }
function openModes() { game.paused = true; ui.modeSwitch = !!game.campaign && ui.started; keys.clear(); saved = loadCampaign(); $('continue-button').hidden = !saved.game; $('start-overlay').hidden = false; $('pause-overlay').hidden = true; $('end-overlay').hidden = true; document.querySelector('.comparison-note').innerHTML=ui.modeSwitch?'섬 · 자원 · 임무 진행을 유지합니다.<br/>이동 방식만 변경합니다.':'같은 초기 섬 · 같은 적 배치 · 같은 보상<br/>모드 선택 시 새 원정으로 시작합니다.'; document.querySelector('[data-start]').focus(); }
function togglePause(force) {
  if (!ui.started || game.phase !== 'playing' || !$('start-overlay').hidden || !$('help-overlay').hidden || !$('settings-overlay').hidden) return;
  game.paused = force ?? !game.paused; keys.clear(); $('pause-overlay').hidden = !game.paused; update(true);
  (game.paused ? $('resume-button') : $('pause-button')).focus();
}
function chooseTile(x, z, edge, facilityId) {
  if (game.paused || !ui.started || game.phase !== 'playing') return;
  let changed = false,showDetails=false;
  const movingWall=ui.tool==='move'&&game.facilities.find(f=>f.id===ui.moving)?.type==='wall';
  if(edge&&ui.tool!=='wall'&&!movingWall){
    ui.selected=facilityId ?? wallAt(game,x,z,edge)?.id ?? null;showTab('build');update(true);if(ui.selected)$('facility-panel').scrollIntoView({block:'nearest',behavior:'instant'});return;
  }
  if (ui.tool === 'expand') changed = expand(game, x, z);
  else if (ui.tool === 'move') changed = moveFacility(game, ui.moving, x, z, edge ?? ui.edge);
  else if (ui.tool) {
    changed = build(game, ui.tool, x, z, edge ?? ui.edge);
    if (changed) {ui.selected = game.facilities.at(-1).id;showDetails=true;}
  } else {
    const facility = facilityId?game.facilities.find(f=>f.id===facilityId):game.facilities.find(f => f.type!=='wall'&&f.x === x && f.z === z) || game.facilities.find(f=>f.x===x&&f.z===z);
    ui.selected = facility?.id ?? null;showDetails=!!facility;showTab('build');
  }
  if (changed) { ui.tool = null; ui.moving = null; }
  update(true); if (changed) persist();
  if(showDetails)$('facility-panel').scrollIntoView({block:'nearest',behavior:'instant'});
}
function setTool(tool) {
  if (!canManage(game) || game.paused) { game.message = '항해와 전투를 마친 뒤 섬을 정비하세요.'; update(true); return; }
  if(tool==='wall')ui.board=true;
  ui.tool = ui.tool === tool ? null : tool; ui.moving = null;ui.commandMode=false;ui.fleetFocus=false;if(view)view.mapFocus=null; showTab('build'); update(true);
}
document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => start(b.dataset.start)));
document.querySelectorAll('[data-experience]').forEach(b => b.addEventListener('click', () => { ui.experience = b.dataset.experience; ui.modeSwitch = false; document.querySelectorAll('[data-experience]').forEach(n => n.classList.toggle('active', n === b)); }));
$('confirm-new').addEventListener('click', () => start(ui.pendingMode, true));
$('cancel-new').addEventListener('click', () => { $('replace-overlay').hidden = true; document.querySelector('[data-start]').focus(); });
$('continue-button').addEventListener('click', () => { saved = loadCampaign(); if (saved.game) { ui.experience = 'campaign'; ui.modeSwitch = false; installGame(saved.game, 'campaign'); if (game.phase === 'playing') { game.paused = false; togglePause(true); } } });
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('show-designs').addEventListener('click',()=>{ui.showLocked=!ui.showLocked;update(true);});
$('board-toggle').addEventListener('click',()=>{ui.board=!ui.board;clearTool();});
$('cancel-tool').addEventListener('click', clearTool);
$('repair-button').addEventListener('click', () => { repair(game); update(true); persist(); });
$('pause-button').addEventListener('click', () => togglePause());
$('resume-button').addEventListener('click', () => togglePause(false));
$('restart-button').addEventListener('click', () => { if (game.campaign) { if (game.operation) {retryDefense(game);installGame(game,'voyage');persist();}else if (game.campaign.stage === 'mission') { retryMission(game); installGame(game, 'voyage'); persist(); } else showTab('campaign'); } else start(game.mode); });
$('retry-button').addEventListener('click', () => { if (game.campaign) { if (game.phase === 'defeat') {if(game.operation)retryDefense(game);else retryMission(game);} else returnToHarbor(game); installGame(game, game.operation?'voyage':'campaign'); persist(); } else start(game.mode); });
for (const id of ['mode-button', 'pause-mode']) $(id).addEventListener('click', openModes);
$('compare-button').addEventListener('click', () => { if (game.campaign) { returnToHarbor(game, game.phase === 'defeat'); installGame(game, 'campaign'); persist(); } else openModes(); });
document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); openModes(); });
$('show-voyage').addEventListener('click', () => showTab(game.campaign?.stage === 'harbor' ? 'campaign' : 'voyage'));
$('home-button').addEventListener('click', () => { if (game.campaign) { returnToHarbor(game, true); installGame(game, 'campaign'); persist(); return; } ui.trackedSite = 'home'; if (game.mode === 'destination') setRoute(game, 'home'); else game.message = '정박지는 지도에서 집 모양으로 표시됩니다. 직접 이동하세요.'; clearTool(); update(true); });
$('help-button').addEventListener('click', () => { ui.helpWasPaused = game.paused; game.paused = true; keys.clear(); $('help-overlay').hidden = false; $('close-help').focus(); });
$('close-help').addEventListener('click', () => { $('help-overlay').hidden = true; game.paused = ui.helpWasPaused; $('help-button').focus(); });
$('tile-board').addEventListener('click', e => { const b = e.target.closest('[data-tile],[data-wall-edge]'); if (b) chooseTile(Number(b.dataset.x), Number(b.dataset.z), b.dataset.wallEdge); });
$('wall-side-picker').addEventListener('click',e=>{const b=e.target.closest('[data-edge-choice]');if(b){ui.edge=b.dataset.edgeChoice;update(true);}});
$('facility-panel').addEventListener('click', e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'upgrade') upgrade(game, ui.selected);
  if (action === 'demolish') { if (demolish(game, ui.selected)) ui.selected = null; }
  if (action === 'move') { ui.tool = 'move'; ui.moving = ui.selected;const f=game.facilities.find(f=>f.id===ui.selected);if(f?.type==='wall')ui.edge=wallEdge(f); }
  if (action === 'collect') collectProduction(game,ui.selected);
  if (action === 'restore') repairStructure(game,ui.selected);
  update(true); if (action) persist();
});
$('facility-panel').addEventListener('change',e=>{if(e.target.matches('[data-targeting]')){setTargeting(game,ui.selected,e.target.value);update(true);persist();}});
$('field-choice').addEventListener('click',e=>{const id=e.target.closest('[data-field-choice]')?.dataset.fieldChoice;if(id&&resolveFieldDecision(game,id)){update(true);persist();}});
$('show-route').addEventListener('change',()=>update(true));
$('field-repair').addEventListener('click',()=>{repair(game);update(true);persist();});
$('escort-repair').addEventListener('click',()=>{repairEscort(game);update(true);persist();});
$('field-resupply').addEventListener('click',()=>{resupplyAbilities(game);update(true);persist();});
let lastSiteKey = '', lastCampaignKey = '', lastFieldIdentity = '', lastObjectiveIdentity = '';
function renderSites() {
  const sites = sitesFor(game), key = `${game.campaign?.missionId || 'training'}:${sites.map(s => s.id).join(',')}`;
  if (key === lastSiteKey) return; lastSiteKey = key;
  $('site-list').innerHTML = sites.length ? sites.map(s => `<article class="site-card" data-site-card="${s.id}"><div class="site-card-top"><span class="site-number">${s.label}</span><span class="danger tier-${s.tier}">위험 ${s.danger}</span></div><h3>${s.name}</h3><p>${s.summary}</p><div class="site-reward"><span>기대 자원 <b>◆ ${s.reward}</b></span><small data-distance="${s.id}"></small></div><button data-site="${s.id}" class="site-button">항로 표시 →</button><small class="site-hint">${s.hint}</small></article>`).join('') : '<p class="voyage-footnote">캠페인에서 임무를 선택하면 항로가 나타납니다.</p>';
}
$('site-list').addEventListener('click', e => {
  const id = e.target.closest('[data-site]')?.dataset.site; if (!id) return;
  ui.trackedSite = id; clearTool();
  if(isExploring(game)&&game.operation.waiting&&!selectExplorationSite(game,id)){update(true);return;}
  if (game.mode === 'destination') setRoute(game, id);
  else { if(game.campaign)startEncounter(game,id); game.message = `${sitesFor(game).find(s => s.id === id).name} 항로를 표시했습니다. WASD로 지도 마커를 향해 이동하세요.`; }
  update(true); persist();
});
$('mission-list').addEventListener('click', e => {
  const id = e.target.closest('[data-mission]')?.dataset.mission;if(!id)return; if (!launchMission(game, id)) { update(true); return; }
  ui.trackedSite = 'objective-0'; ui.selected = null; ui.tool = null; keys.clear(); view?.reset(); lastSiteKey = ''; showTab('voyage');
  if (game.mode === 'destination') setRoute(game, 'objective-0'); update(true); persist();
});
$('defense-list').addEventListener('click',e=>{const id=e.target.closest('[data-defense]')?.dataset.defense;if(id&&launchDefense(game,id)){view?.reset();ui.tool=null;ui.selected=null;lastSiteKey='';showTab('voyage');update(true);persist();}});
$('siege-list').addEventListener('click',e=>{const id=e.target.closest('[data-siege]')?.dataset.siege;if(!id)return;if(launchDefense(game,id)){view?.reset();ui.tool=null;ui.selected=null;lastSiteKey='';showTab('voyage');}update(true);persist();});
$('exploration-list').addEventListener('click',e=>{const id=e.target.closest('[data-explore]')?.dataset.explore;if(id&&launchDefense(game,id)){view?.reset();ui.tool=null;ui.selected=null;lastSiteKey='';showTab('voyage');}update(true);persist();});
$('atlas-chapter').addEventListener('change',()=>{updateAtlas(true);});
$('atlas-content').addEventListener('click',e=>{const id=e.target.closest('[data-atlas-launch]')?.dataset.atlasLaunch;if(!id)return;if(launchDefense(game,id)){view?.reset();ui.tool=null;ui.selected=null;lastSiteKey='';showTab('voyage');}update(true);persist();});
$('send-survey').addEventListener('click',()=>{const units=ui.selectedUnits.length?ui.selectedUnits:game.fleet.units.filter(u=>u.hp>0).map(u=>u.id);if(units.length)orderUnits(game,units,'move',game.catalog[game.operation.round]);else if(game.mode==='destination')setRoute(game,game.catalog[game.operation.round].id);else game.message='함대를 잃었습니다. WASD로 섬의 물가를 조사 지점4m 안에 대세요.';update(true);persist();});
$('extract-exploration').addEventListener('click',()=>{finishExploration(game);update(true);persist();});
$('start-defense-wave').addEventListener('click',()=>{
  if(startDefenseWave(game)&&game.operation.kind==='siege'&&game.mode==='destination')setRoute(game,game.catalog[game.operation.round].id);
  update(true);persist();
});
$('research-list').addEventListener('click', e => { const id = e.target.closest('[data-research]')?.dataset.research; if (id) { researchTechnology(game, id); update(true); persist(); } });
document.querySelectorAll('[data-ability]').forEach(b => b.addEventListener('click', () => { useAbility(game, b.dataset.ability); update(true); persist(); }));
let saveSequence=0;
function persist() {
  if (!ui.started || !game.campaign) return;
  const sequence=++saveSequence;
  const result = saveCampaign(game); $('save-status').textContent = result.ok ? `자동 저장 완료 · ${desktop.enabled?'내 PC':'이 브라우저'}` : `저장하지 못했습니다: ${result.error}. 파일 내보내기로 보관할 수 있습니다.`;
  $('save-status').classList.toggle('save-error', !result.ok);
  if(desktop.enabled){
    let text;try{text=encodeSave(game);}catch(error){return {ok:false,error:error.message};}
    desktop.write(text).then(r=>{if(sequence!==saveSequence)return;$('save-status').textContent=r.ok?'자동 저장 완료 · 내 PC':`PC 파일 저장 실패: ${r.error}. 파일 내보내기로 보관할 수 있습니다.`;$('save-status').classList.toggle('save-error',!r.ok);});
    return {...result,nativeQueued:true};
  }
  return result;
}
desktop.onBeforeClose(async()=>{keys.clear();if(ui.started&&game.phase==='playing'&&!game.paused)togglePause(true);const result=persist();return desktop.enabled&&result?.nativeQueued?desktop.flush():result?.ok===false?result:desktop.flush();});
$('save-button').addEventListener('click', persist);
$('export-save').addEventListener('click', () => {
  if (!game.campaign) return;
  try { const blob = new Blob([encodeSave(game)], { type: 'application/json' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `tidehold-${game.campaign.completed.length}-missions.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  catch (error) { $('save-status').textContent = `내보내기 실패: ${error.message}`; }
});
$('import-save').addEventListener('click', () => $('save-file').click());
$('save-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try { if (file.size > 1000000) throw new Error('파일은 1MB 이하여야 합니다.'); const restored = decodeSave(await file.text()); installGame(restored, 'campaign'); persist(); if (game.phase === 'playing') { game.paused = false; togglePause(true); } }
  catch (error) { $('save-status').textContent = `불러오기 실패: ${error.message}. 기존 진행은 유지됩니다.`; }
  e.target.value = '';
});
function selectUnits(ids,append=false) {
  const living=new Set((game.fleet?.units||[]).filter(u=>u.hp>0).map(u=>u.id));
  ui.selectedUnits=[...new Set(append?[...ui.selectedUnits,...ids]:ids)].filter(id=>living.has(id));ui.commandMode=true;ui.selected=null;ui.tool=null;ui.moving=null;ui.lastGroup=null;update(true);
}
function groupControlsAvailable(){return game.campaign&&ui.started&&$('start-overlay').hidden&&$('help-overlay').hidden&&$('settings-overlay').hidden&&!game.paused&&game.phase==='playing'&&!game.campaign.pendingChoice;}
function storeGroup(number,append=false){
  if(!groupControlsAvailable())return;
  if(assignControlGroup(game,number,ui.selectedUnits,append)){ui.lastGroup=null;persist();update(true);}
}
function selectGroup(number,append=false){
  if(!groupControlsAvailable())return;
  const ids=controlGroupUnits(game,number);if(!ids.length)return;
  const now=performance.now(),focus=!append&&ui.lastGroup?.number===number&&now-ui.lastGroup.time<350;
  selectUnits(ids,append);ui.lastGroup={number,time:now};
  if(focus){ui.fleetFocus=true;if(view)view.mapFocus=null;update(true);}
}
$('fleet-panel').addEventListener('click',e=>{
  const b=e.target.closest('[data-control-group],[data-group-save]');if(!b)return;
  if(b.dataset.groupSave)storeGroup(Number(b.dataset.groupSave),e.shiftKey);
  else if(e.ctrlKey)storeGroup(Number(b.dataset.controlGroup),e.shiftKey);
  else selectGroup(Number(b.dataset.controlGroup),e.shiftKey);
});
function issueOrder(type,point) {ui.lastGroup=null;if(orderUnits(game,ui.selectedUnits,type,point)){ui.attackMove=false;persist();}update(true);}
$('command-toggle').addEventListener('click',()=>{ui.commandMode=!ui.commandMode;ui.tool=null;ui.hover=null;update(true);});
document.querySelectorAll('[data-order]').forEach(b=>b.addEventListener('click',()=>issueOrder(b.dataset.order)));
$('attack-move').addEventListener('click',()=>{ui.attackMove=!ui.attackMove;ui.commandMode=true;update(true);});
$('fleet-focus').addEventListener('click',()=>{ui.fleetFocus=!ui.fleetFocus;if(view)view.mapFocus=null;update(true);});
$('select-all-units').addEventListener('click',()=>selectUnits((game.fleet?.units || []).filter(u=>u.hp>0).map(u=>u.id)));
$('repair-fleet').addEventListener('click',()=>{repairFleet(game);update(true);persist();});
$('build-shipyard').addEventListener('click',()=>setTool('shipyard'));
document.querySelectorAll('[data-recruit]').forEach(b=>b.addEventListener('click',()=>{if(recruitUnit(game,b.dataset.recruit)){selectUnits([game.fleet.units.at(-1).id]);}update(true);persist();}));
$('unit-list').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.unitSelect)selectUnits([Number(b.dataset.unitSelect)],e.shiftKey);
  if(b.dataset.unitUpgrade){upgradeUnit(game,Number(b.dataset.unitUpgrade));update(true);persist();}
  if(b.dataset.unitDismiss){dismissUnit(game,Number(b.dataset.unitDismiss));update(true);persist();}
});
const fleetHelp=document.createElement('div');fleetHelp.className='fleet-help';fleetHelp.innerHTML='<h3>함대 지휘</h3><p>조선소 건설 → 함대 생산 → 원정 출항. Q로 함대 선택 모드를 켜고 클릭·드래그로 배를 선택합니다. Shift로 추가 선택, 우클릭으로 이동·적 공격, X로 공격 이동, H로 사수, G로 섬 호위, F로 전체 선택합니다. C로 선택 함대와 섬 시점을 전환하며 지도 클릭으로 먼 곳을 봅니다. 선택 모드에서 Alt+우클릭 드래그로 시점을 회전합니다. 유닛과 명령도 자동 저장됩니다.</p>';$('help-overlay').querySelector('dl').after(fleetHelp);
$('help-overlay').querySelector('.help-dialog>p').textContent='캠페인은 자동 저장되며 이어하기와 저장 파일 내보내기를 지원합니다. 비교 훈련은 저장되지 않습니다.';
fleetHelp.insertAdjacentHTML('beforeend','<p>5–9번으로 전대를 선택하고 Ctrl+숫자로 등록합니다. Ctrl+Shift+숫자는 편성에 추가, Shift+숫자는 현재 선택에 추가합니다. 같은 번호를 두 번 누르면 전대 시점으로 이동합니다. 전대도 캠페인에 저장되며 능력은 기존 1–4번을 사용합니다.</p>');
let rightDrag = null,selectionDrag=null;
const canvas = view?.renderer.domElement;
canvas?.addEventListener('pointerdown', e => {
  if(!ui.started||game.paused||game.phase!=='playing')return;
  if(e.button===2&&ui.commandMode&&!e.altKey){const hit=view.pickCombat(e.clientX,e.clientY),point=view.pointAt(e.clientX,e.clientY);if(hit?.enemy)issueOrder('attack',{id:hit.enemy});else if(point)issueOrder(ui.attackMove?'attackMove':'move',point);return;}
  if (e.button === 2 || e.button===1) { rightDrag = e.clientX; canvas.setPointerCapture(e.pointerId); }
  else if(e.button===0&&ui.commandMode){selectionDrag={x:e.clientX,y:e.clientY,shift:e.shiftKey};canvas.setPointerCapture(e.pointerId);}
  else if (e.button === 0) { const tile = view.pick(e.clientX, e.clientY,ui.tool); if (tile) chooseTile(tile.x, tile.z,ui.tool==='wall'||(ui.tool==='move'&&game.facilities.find(f=>f.id===ui.moving)?.type==='wall')?tile.edge:undefined,tile.facilityId); else { ui.selected = null; update(true); } }
});
canvas?.addEventListener('pointermove', e => {
  if (rightDrag !== null) { view.yaw -= (e.clientX - rightDrag) * 0.008; rightDrag = e.clientX; }
  if(selectionDrag){const r=$('scene').getBoundingClientRect(),box=$('selection-box');box.hidden=false;box.style.left=`${Math.min(e.clientX,selectionDrag.x)-r.left}px`;box.style.top=`${Math.min(e.clientY,selectionDrag.y)-r.top}px`;box.style.width=`${Math.abs(e.clientX-selectionDrag.x)}px`;box.style.height=`${Math.abs(e.clientY-selectionDrag.y)}px`;}
  ui.hover = ui.commandMode?null:view.pick(e.clientX, e.clientY,ui.tool);
});
canvas?.addEventListener('pointerup', e => {
  rightDrag=null;if(!selectionDrag)return;
  const start=selectionDrag;selectionDrag=null;$('selection-box').hidden=true;
  if(Math.hypot(e.clientX-start.x,e.clientY-start.y)<5){const hit=view.pickCombat(e.clientX,e.clientY);selectUnits(hit?.unit?[hit.unit]:[],start.shift);}
  else {const x=Math.min(e.clientX,start.x),y=Math.min(e.clientY,start.y),right=Math.max(e.clientX,start.x),bottom=Math.max(e.clientY,start.y);selectUnits((game.fleet?.units || []).filter(u=>{const p=view.projectWorld(u);return u.hp>0&&p.x>=x&&p.x<=right&&p.y>=y&&p.y<=bottom;}).map(u=>u.id),start.shift);}
});
canvas?.addEventListener('pointercancel', () => { rightDrag = null;selectionDrag=null;$('selection-box').hidden=true; });
canvas?.addEventListener('pointerleave', () => { ui.hover = null; });
canvas?.addEventListener('contextmenu', e => e.preventDefault());
canvas?.addEventListener('wheel', e => { e.preventDefault(); view.zoom = Math.min(45, Math.max(13, view.zoom + e.deltaY * 0.018)); view.resize(); }, { passive: false });
const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
// Physical keys keep movement and shortcuts usable with Korean IME enabled.
const controlKey = e => /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : /^Digit[1-9]$/.test(e.code) ? e.code.slice(5) : e.key.toLowerCase();
window.addEventListener('keydown', e => {
  const key = controlKey(e);
  if(e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
  if(controlGroupNumbers.includes(Number(key))&&!e.altKey&&!e.metaKey&&groupControlsAvailable()){
    e.preventDefault();if(!e.repeat){if(e.ctrlKey)storeGroup(Number(key),e.shiftKey);else selectGroup(Number(key),e.shiftKey);}return;
  }
  ui.lastGroup=null;
  if(e.ctrlKey || e.metaKey || e.altKey)return;
  // UI arrows/Space must remain keyboard-operable and must not steer the island.
  if (e.target.closest('button,a,input,select,textarea') && key.startsWith('arrow')) return;
  if (movementKeys.has(key) && ui.started && !game.paused && $('start-overlay').hidden && $('help-overlay').hidden && game.phase === 'playing') { e.preventDefault(); keys.add(key); }
  if (e.repeat) return;
  if(game.campaign&&ui.started&&$('start-overlay').hidden&&$('help-overlay').hidden&&$('settings-overlay').hidden&&!game.paused&&game.phase==='playing'){
    if(key==='q')$('command-toggle').click();if(key==='f')$('select-all-units').click();if(key==='h')issueOrder('hold');if(key==='g')issueOrder('escort');if(key==='x')$('attack-move').click();if(key==='c')$('fleet-focus').click();
  }
  if (key === 'p') togglePause();
  if (['1','2','3','4'].includes(key) && $('start-overlay').hidden && $('help-overlay').hidden) { const id = Object.keys(abilityDefinitions)[Number(key)-1]; useAbility(game, id); update(true); persist(); }
  if (key === 'escape') { if (!$('settings-overlay').hidden) $('close-settings').click(); else if (!$('help-overlay').hidden) $('close-help').click(); else if (ui.tool) clearTool(); else togglePause(); }
});
window.addEventListener('keyup', e => keys.delete(controlKey(e)));
window.addEventListener('blur', () => { keys.clear(); if (ui.started && !game.paused && $('start-overlay').hidden && $('help-overlay').hidden) togglePause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); togglePause(true); persist(); } });
window.addEventListener('pagehide', persist);
const mapCtx = $('minimap').getContext('2d');
function drawMap() {
  const c = mapCtx, w = 230, h = 180;
  c.clearRect(0, 0, w, h); c.strokeStyle = '#bfdbce20'; c.lineWidth = 1;
  for (let x = 15; x < w; x += 25) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = 10; y < h; y += 25) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  const point = (p) => ({ x: 115 + p.x * 0.65, y: 100 + p.z * 0.65 });
  const current = point(game.island), tracked = ui.trackedSite === 'home' ? { x: 0, z: 0 } : sitesFor(game).find(s => s.id === ui.trackedSite);
  if (tracked) { const p = point(tracked); c.strokeStyle = '#edcc8290'; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(current.x, current.y); c.lineTo(p.x, p.y); c.stroke(); c.setLineDash([]); }
  c.font = '14px sans-serif'; c.fillStyle = '#bbd3c9'; c.textAlign = 'center'; c.fillText('⌂', 115, 110);
  for (const [i, s] of sitesFor(game).entries()) {
    if(!knownSite(game,s.id))continue;
    const p = point(s), cleared = game.sites[i].cleared; c.fillStyle = cleared ? '#99c0a5' : s.tier === 3 ? '#e59d88' : '#efcf96';
    c.beginPath(); c.moveTo(p.x, p.y - 5); c.lineTo(p.x + 5, p.y); c.lineTo(p.x, p.y + 5); c.lineTo(p.x - 5, p.y); c.closePath(); c.fill();
    c.font = '11px sans-serif'; c.fillText(cleared ? '✓' : s.label, p.x, p.y - 11);
  }
  for(const u of game.fleet?.units || [])if(u.hp>0){const p=point(u);c.fillStyle=ui.selectedUnits.includes(u.id)?'#f5e0a8':'#a6e1af';c.fillRect(p.x-2,p.y-2,4,4);}
  for(const e of game.enemies)if(e.hp>0&&e.active){const p=point(e);c.fillStyle='#e2927d';c.fillRect(p.x-1.5,p.y-1.5,3,3);}
  c.save(); c.translate(current.x, current.y); c.rotate(-game.heading + Math.PI); c.fillStyle = '#eff6de'; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill(); c.restore();
}
$('minimap').addEventListener('click',e=>{
  if(!view||!ui.started||!game.campaign)return;const r=e.currentTarget.getBoundingClientRect();
  view.mapFocus={x:Math.max(-109,Math.min(109,((e.clientX-r.left)*230/r.width-115)/0.65)),z:Math.max(-109,Math.min(109,((e.clientY-r.top)*180/r.height-100)/0.65))};ui.fleetFocus=false;
});
let lastUnitKey='';
function updateFleet() {
  const c=game.campaign,units=(game.fleet?.units || []).filter(u=>u.hp>0),yard=Math.max(0,...game.facilities.filter(f=>f.type==='shipyard').map(f=>f.level));
  document.querySelector('[data-tab="fleet"]').hidden=!c;$('fleet-toolbar').hidden=!c||!units.length;
  if(!c)return;
  ui.selectedUnits=ui.selectedUnits.filter(id=>units.some(u=>u.id===id));
  $('selection-count').textContent=`선택 ${ui.selectedUnits.length}`;$('command-toggle').setAttribute('aria-pressed',String(ui.commandMode));$('attack-move').setAttribute('aria-pressed',String(ui.attackMove));
  $('fleet-focus').textContent=ui.fleetFocus?'섬 시점':'함대 시점';
  const groupReady=groupControlsAvailable();
  for(const number of controlGroupNumbers){
    const members=controlGroupUnits(game,number),b=document.querySelector(`[data-control-group="${number}"]`),selected=members.length===ui.selectedUnits.length&&members.length>0&&members.every(id=>ui.selectedUnits.includes(id));
    b.querySelector('[data-group-count]').textContent=`${members.length}기`;b.disabled=!groupReady||!members.length;b.setAttribute('aria-pressed',String(selected));
    document.querySelector(`[data-group-save="${number}"]`).disabled=!groupReady||!ui.selectedUnits.length;
  }
  $('fleet-capacity').textContent=yard?`함대 정원 ${fleetSupply(game)} / ${fleetCapacity(game)} · 조선소 ${yard}단계`:'첫 원정에서 자원을 회수한 뒤 조선소를 건설하세요.';
  $('build-shipyard').hidden=yard>0;$('build-shipyard').disabled=!canManage(game)||game.paused||game.resources<120;
  const safe=canManage(game)&&!game.paused,commandable=['mission','operation'].includes(c.stage)&&game.phase==='playing'&&!game.paused&&!c.pendingChoice;
  document.querySelectorAll('[data-recruit]').forEach(b=>{const u=unitTypes[b.dataset.recruit];b.disabled=!safe||yard<u.yardLevel||c.chapter<u.unlock||fleetSupply(game)+u.supply>fleetCapacity(game)||game.resources<u.cost;b.title=`${u.description} · 정원 ${u.supply} · 조선소 ${u.yardLevel}단계 · ${u.unlock+1}번째 해역`;} );
  document.querySelectorAll('[data-order],#attack-move').forEach(b=>b.disabled=!commandable||!ui.selectedUnits.length);
  $('repair-fleet').textContent=`함대 수리 ◆ ${fleetRepairCost(game)}`;$('repair-fleet').disabled=!safe||fleetRepairCost(game)<=0||game.resources<fleetRepairCost(game);
  const identity=JSON.stringify([units.map(u=>[u.id,u.type,u.level]),ui.selectedUnits]);
  if(identity!==lastUnitKey){lastUnitKey=identity;$('unit-list').innerHTML=units.map(u=>`<div class="unit-card ${ui.selectedUnits.includes(u.id)?'selected':''}" data-unit-card="${u.id}"><button data-unit-select="${u.id}" aria-pressed="${ui.selectedUnits.includes(u.id)}">${unitTypes[u.type].icon} ${unitTypes[u.type].name} #${u.id} · ${u.level}단계</button><p data-unit-stats></p><div class="meter"><i data-unit-hp></i></div><small data-unit-command></small><div class="utility-row"><button data-unit-upgrade="${u.id}">강화 ◆ ${unitUpgradeCost(u)}</button><button data-unit-dismiss="${u.id}">편성 해제</button></div></div>`).join('')||'<p class="board-help">조선소에서 함대를 생산하면 이곳에서 편성·강화·수리할 수 있습니다.</p>';}
  for(const u of units){const card=document.querySelector(`[data-unit-card="${u.id}"]`),stats=unitStats(game,u),near=distance(u,game.island)<=fleetRules.serviceRange;card.querySelector('[data-unit-stats]').textContent=`내구도 ${Math.ceil(u.hp)} / ${u.maxHp} · 사거리 ${stats.range}m · ${stats.heal?`복구 ${Math.round(stats.heal)}`:`피해 ${Math.round(stats.damage)}`}`;card.querySelector('[data-unit-hp]').style.width=`${u.hp/u.maxHp*100}%`;card.querySelector('[data-unit-command]').textContent={escort:'섬 호위',hold:'위치 사수',move:'이동 중',attackMove:'공격하며 이동',attack:'집중 공격'}[u.command.type];card.querySelector('[data-unit-upgrade]').disabled=!safe||!near||u.level>=Math.min(6,2+Math.floor(c.chapter/2))||game.resources<unitUpgradeCost(u);card.querySelector('[data-unit-dismiss]').disabled=!safe||!near;}
}
let lastFacilityKey = '', lastBoardKey = '';
let lastDefenseKey='';
function updateDefense(force) {
  const c=game.campaign,op=game.operation,def=getOperation(op?.id);$('defense-control').hidden=!def||c?.stage!=='operation';$('frontier-panel').hidden=!c;
  if(!c)return;
  const key=JSON.stringify([c.chapter,c.completed.length,c.frontier?.cleared,c.stage,game.paused]);
  if(force||key!==lastDefenseKey){lastDefenseKey=key;const available=new Set(availableDefenses(game).map(d=>d.id));$('defense-list').innerHTML=defenseContracts.filter(d=>d.chapter<=c.chapter).map(d=>{const record=c.frontier?.records[d.id];return `<button class="mission-card" data-defense="${d.id}" ${!available.has(d.id)||game.paused||c.stage!=='harbor'?'disabled':''}><span class="mission-type">${chapters[d.chapter].name} · ${defensePatterns[d.pattern].name}</span><strong>${d.name}${record?' ✓':''}</strong><small>${d.description}</small><span class="mission-cost">${d.waves}공세 · ◆ ${record?Math.floor(d.reward*0.4):d.reward}${record?` · 최고 ${record.score}점`:` · 연구 +${d.research}`}</span></button>`;}).join('');}
  const siegeKey=`${key}:${game.fleet?.units.filter(u=>u.hp>0).length}`;
  if(force||$('siege-list').dataset.key!==siegeKey){$('siege-list').dataset.key=siegeKey;const available=new Set(availableSieges(game).map(d=>d.id));$('siege-list').innerHTML=siegeContracts.filter(d=>d.chapter<=c.chapter&&(!d.endgame||c.completed.length===missions.length)).map(d=>{const record=c.frontier?.records[d.id];return `<button class="mission-card" data-siege="${d.id}" ${!available.has(d.id)||game.paused||c.stage!=='harbor'?'disabled':''}><span class="mission-type">${d.endgame?'엔딩 이후 · ':''}${chapters[d.chapter].name} · ${siegePatterns[d.pattern].name}</span><strong>${d.name}${record?' ✓':''}</strong><small>${d.description}</small><span class="mission-cost">3 거점 · ◆ ${record?Math.floor(d.reward*0.4):d.reward}${record?` · 최고 ${record.score}점`:` · 연구 +${d.research}`}</span></button>`;}).join('');}
  if(force||$('exploration-list').dataset.key!==siegeKey){$('exploration-list').dataset.key=siegeKey;const available=new Set(availableExplorations(game).map(d=>d.id));$('exploration-list').innerHTML=explorations.filter(d=>d.chapter<=c.chapter).map(d=>{const record=c.frontier?.records[d.id],chart=atlasChart(c,d.id),charted=Math.max(chart.surveyed.length,chart.legacySurveyed);return `<button class="mission-card" data-explore="${d.id}" ${!available.has(d.id)||game.paused||c.stage!=='harbor'?'disabled':''}><span class="mission-type">${chapters[d.chapter].name} · 신호 발견과 조사</span><strong>${d.name}${record?' ✓':''}</strong><small>${d.description}</small><span class="mission-cost">8 지점 · ◆ ${record?Math.floor(d.reward*0.4):d.reward} · 연구 +${record?0:d.research}${record?` · 보관 ${charted}/8`:''}</span></button>`;}).join('');}
  const exploring=def?.kind==='explore';$('send-survey').hidden=!exploring;$('extract-exploration').hidden=!exploring;$('start-defense-wave').hidden=exploring;
  if(!def)return;
  if(exploring){
    const surveyed=game.sites.filter(s=>s.cleared).length,landmarks=game.catalog.filter(s=>s.landmark&&game.sites.find(v=>v.id===s.id).cleared).length,site=game.catalog[op.round],alive=game.enemies.filter(e=>e.hp>0).length;
    $('defense-title').textContent=def.name;$('defense-status').textContent=`발견 ${op.visible.length}/8 · 조사 ${surveyed}/8 · 필수 기록 ${landmarks}/3 · ${c.pendingChoice?'회수품 선택':op.waiting?'다음 조사 항로 선택':alive?`${site.name} · 수비대 ${alive} · 공세 ${c.encounterWave+1}/${site.waves}`:`${site.name} · 근접 조사 ${op.scan.toFixed(1)}/2초`}`;
    $('send-survey').disabled=op.waiting||!!c.pendingChoice||game.paused||alive>0||c.encounterWave+1<site.waves;$('send-survey').textContent=game.fleet.units.some(u=>u.hp>0)?ui.selectedUnits.length?'선택 함대를 조사 지점으로':'함대를 조사 지점으로':'섬으로 조사 지점 접근';$('extract-exploration').disabled=!canExtract(game)||game.paused;
    $('mission-hud').hidden=false;$('mission-name').textContent=def.name;$('mission-progress').textContent=$('defense-status').textContent;$('ally-hud').hidden=true;$('ability-bar').hidden=c.stage!=='operation';$('restart-button').textContent='탐험 재시작';$('route-toggle').hidden=true;$('field-repairs').hidden=false;$('enemy-intel').hidden=false;
    $('sea-state').textContent=game.paused?'일시정지':op.waiting?'탐험 · 다음 신호 선택':'탐험 · '+site.name;
    $('enemy-intel').innerHTML=`<h3>미지 항로 탐험</h3><p class="board-help">${def.description}</p><p class="board-help">미발견 신호는 지도에 나타나지 않습니다. 함대를 나누어 정찰하세요. 수비대 격파 후 함선6m 또는 섬 물가4m 안에서2초 조사합니다. 조사 사이에 시설·함대 정비와 수확이 가능합니다.</p>`;
    document.querySelectorAll('[data-ability]').forEach(b=>{const id=b.dataset.ability;b.disabled=!!c.pendingChoice||game.paused||c.abilityCooldowns[id]>0||(id!=='brace'&&c.abilityCharges[id]<=0)||id==='brace';});return;
  }
  const siege=def.kind==='siege',cores=game.enemies.filter(e=>e.type==='baseCore'&&e.hp>0&&!e.captured),generators=game.enemies.filter(e=>e.type==='generator'&&e.hp>0&&!e.captured);
  const splitSupply=siege&&game.enemies.some(e=>e.type==='baseCore'&&e.powerBus!==undefined);
  const circuitOrder={west:0,shared:1,east:2},circuitName={west:'서',shared:'중앙',east:'동'};
  const coreSupply=splitSupply?`핵 전력 ${[...cores].sort((a,b)=>(circuitOrder[a.powerBus]??1)-(circuitOrder[b.powerBus]??1)).map(e=>`${circuitName[e.powerBus]||'공용'} ${basePower(game,e)}`).join(' · ')}`:`동력 공급 ${cores.some(e=>basePower(game,e)>0)?'유지':'차단'}`;
  $('defense-title').textContent=def.name;$('defense-status').textContent=siege?`${siegePatterns[def.pattern].name} · 거점 ${op.round+1}/3 · ${op.waiting?'함대 정비 후 공략하세요.':`지휘핵 ${cores.length} · 동력기 ${generators.length} · ${coreSupply}`}`:`${defensePatterns[def.pattern].name} · 공세 ${op.round+1}/${def.waves} · ${op.waiting?'시설·함대 정비 후 시작하세요.':`남은 적 ${game.enemies.filter(e=>e.hp>0).length}기`}`;
  $('start-defense-wave').disabled=!op.waiting||game.paused;$('start-defense-wave').textContent=`${op.round+1}번째 ${siege?'거점 공략':'공세 시작'}`;
  $('mission-hud').hidden=false;$('mission-name').textContent=def.name;$('mission-progress').textContent=$('defense-status').textContent;$('ally-hud').hidden=true;
  $('ability-bar').hidden=c.stage!=='operation';$('restart-button').textContent=siege?'기지 공략 재시작':'방어 재시작';$('route-toggle').hidden=true;
  $('sea-state').textContent=game.paused?'일시정지':siege?op.waiting?'거점 확보 · 함대 정비':'기지 공략 · 동력망과 지휘핵':'기지 방어 · '+(op.waiting?'공세 사이 정비':'공세 진행');
  if(siege){$('field-repairs').hidden=c.stage!=='operation';$('field-resupply').hidden=false;$('enemy-intel').hidden=c.stage!=='operation';$('enemy-intel').innerHTML=`<h3>기지 공략</h3><p class="board-help">${def.description}</p><p class="board-help">동력기를 끊으면 포탑 화력·지휘핵 장갑과 수리가 약해집니다. 모든 지휘핵 파괴 시 확보하며 남은 수비대는 항복합니다. 보급 창고는 먼저 파괴해야 자원을 회수합니다.</p>${splitSupply?'<p class="board-help">서부 회로는 금색, 동부 회로는 청록색입니다. 중앙 지휘핵은 두 회로를 공유합니다. 핵 전력 숫자는 공급 중인 동력기 수이며, 0이면 장갑과 수리 공급이 끊깁니다.</p>':''}`;}
  document.querySelectorAll('[data-ability]').forEach(b=>{const id=b.dataset.ability;b.disabled=c.stage!=='operation'||game.paused||c.abilityCooldowns[id]>0||(id!=='brace'&&c.abilityCharges[id]<=0)||id==='brace';});
}
function updateAtlas(force=false){
  const c=game.campaign;document.querySelector('[data-tab="atlas"]').hidden=!c;if(!c)return;
  const filter=$('atlas-chapter');for(const option of filter.options)if(option.value!=='current')option.disabled=Number(option.value)>c.chapter;
  if(filter.value!=='current'&&Number(filter.value)>c.chapter)filter.value='current';
  const chapter=filter.value==='current'?c.chapter:Number(filter.value),key=JSON.stringify([chapter,c.stage,c.chapter,c.frontier?.cleared,c.atlas,game.paused]);
  if(force||$('atlas-content').dataset.key!==key){$('atlas-content').dataset.key=key;$('atlas-content').innerHTML=atlasMarkup(game,chapter);}
}
function updateCampaign(force) {
  const c = game.campaign;
  $('scene-title').textContent=(c?.stage==='operation'?getOperation(game.operation?.id)?.name:c?.stage==='mission'?getMission(c.missionId)?.name:null)||'나의 섬, 다음 항해.';
  document.querySelector('[data-tab="campaign"]').hidden = !c;
  $('mission-hud').hidden = !c || c.stage === 'harbor'; $('ability-bar').hidden = !c || c.stage !== 'mission';
  $('route-toggle').hidden=!c || c.stage!=='mission'; $('operation-report').hidden=!c || c.stage!=='mission';
  $('field-repairs').hidden=!c || c.stage!=='mission';
  $('field-repair').disabled=!canManage(game)||game.paused||game.hull>=game.maxHull||game.resources<35;
  $('escort-repair').hidden=getMission(c?.missionId)?.kind!=='defend';
  $('escort-repair').disabled=!canManage(game)||game.paused||!c||c.allyHull>=c.allyMaxHull||game.resources<40;
  $('field-resupply').disabled=!canManage(game)||game.paused||!c?.abilityCharges||game.resources<75||Object.values(c.abilityCharges).every(n=>n>=12);
  $('field-choice').hidden=!c?.pendingChoice;
  $('restart-button').textContent = c ? c.stage === 'mission' ? '임무 재시작' : '캠페인 지도' : '다시 시작';
  $('mode-button').textContent = c ? '⇄ 이동 방식 변경 · 진행 유지' : '⇄ 이동 방식 비교';
  document.querySelector('.sidebar-footer span:last-child').textContent = c ? 'CAMPAIGN / 개발 중' : 'TRAINING / 01';
  $('show-voyage').innerHTML = c && c.stage === 'harbor' ? '캠페인 항로 선택 <span>→</span>' : '탐험 항로 보기 <span>→</span>';
  document.querySelector('.map-title small').textContent = c ? getChapter(game).name : '고정 시나리오 01';
  document.querySelector('#help-overlay .compact-dialog>p').textContent = c ? '캠페인은 5초마다 자동 저장합니다. 새로고침 후 이어하기로 복원합니다. 임무 재시작과 포기는 출항 전 섬 상태로 복구합니다. 숫자 1·2·3으로 긴급 능력을 사용할 수 있습니다.' : '비교 훈련은 저장하지 않습니다. 새로고침하면 시작 화면으로 돌아옵니다.';
  if(c)document.querySelector('#help-overlay .compact-dialog>p').textContent+=' 숫자4 정박 방호는 환경 공격 예고에 맞춰 사용하세요. 물자는 회수품 선택과 현장 재보급으로 채웁니다. 적은 실제 섬 가장자리에서 공격합니다. 확장한 섬에는 무장을 여러 방향에 배치하고, 회피할 때는 섬 전체가 붉은 영역을 벗어나게 하세요. 목표 확보 후에는 현장 정비가 유지됩니다. 정비를 마치고 항로 버튼을 누르거나 직접 이동하면 다음 교전이 시작됩니다.';
  $('minimap').setAttribute('aria-label',c?'현재 원정 경로와 나의 섬 위치 지도':'정박지와 세 전투 위치 지도');
  const guide=document.querySelectorAll('.loop-guide li span');
  guide[1].textContent=c?'원정 목표에서 적 처치 · 회수품 선택':'산호 여울에서 적을 처치';guide[2].textContent=c?'정비 · 연구 · 다음 해역으로 출항':'자원으로 섬 확장 · 다음 적에게';
  document.querySelector('#help-overlay dd:last-of-type').textContent=c?'휠 확대·축소, 오른쪽 드래그 회전. P 일시정지, Esc 배치 취소 또는 일시정지. 임무 다시 시작은 출항 전 섬을 복원합니다. 이동 방식 변경은 진행을 유지합니다.':'휠 확대·축소, 오른쪽 드래그 회전. P 일시정지, Esc 배치 취소 또는 일시정지. 다시 시작은 자원·섬·적을 모두 초기화합니다.';
  $('boss-hud').hidden=true;$('enemy-intel').hidden=!c || c.stage!=='mission';
  if (!c) return;
  const m = getMission(c.missionId), chapter = getChapter(game);
  $('chapter-title').textContent = `${String(c.chapter+1).padStart(2,'0')} · ${chapter.name}`;
  $('campaign-progress').textContent = `${c.completed.length}/${missions.length} 임무 · 시설 전력 ${powerUsed(game)}/${powerCapacity(game)} · ${Math.floor(c.totalActiveSeconds/60)}분`;
  $('chapter-briefing').textContent = chapter.briefing;
  if (m) {
    $('operation-report').textContent=m.briefing;
    $('mission-name').textContent = m.name;
    const site=game.catalog[c.objectiveIndex];
    $('mission-progress').textContent = `${c.pendingChoice?'회수 물자 선택':site?.name || m.description} · 목표 ${c.objectiveIndex+1}/${game.catalog.length}${site?.waves ? ` · 공세 ${c.encounterWave+1}/${site.waves}`:''} · ${Math.floor(c.missionSeconds/60)}:${String(Math.floor(c.missionSeconds%60)).padStart(2,'0')}`;
    if(c.fortressBreaks)$('mission-progress').textContent+=` · 방호망 ${c.fortressBreaks}개 해체`;
    $('ally-hud').hidden = c.expeditionVersion===2?!c.allyPosition:m.kind !== 'defend'; $('ally-hud').textContent = `호위선 ${Math.ceil(c.allyHull)} / ${c.allyMaxHull}`;
    const bosses=game.enemies.filter(e=>e.type==='leviathan' && e.hp>0 && e.active);
    $('boss-hud').hidden=!bosses.length;
    const bossKey=bosses.map(e=>`${e.id}:${Math.ceil(e.hp)}:${e.bossPhase}:${Math.ceil((e.windup?.remaining || 0)*10)}`).join('|');
    if(bossKey!==$('boss-hud').dataset.key || force) {
      $('boss-hud').dataset.key=bossKey;
      $('boss-hud').innerHTML=bosses.map((e,i)=>{const stats=enemyStats(game,e);return `<div class="guardian-status ${e.windup?'warning':''}"><div><strong>${stats.name}${bosses.length>1?` ${i+1}`:''}</strong><span>${e.bossPhase===2?'격노':'교전'} · 장갑 ${Math.round(stats.armor*100)}%</span></div><div class="meter"><i style="width:${e.hp/e.maxHp*100}%"></i></div><small>${e.windup?`${bossTactics[stats.pattern].attack} · ${e.windup.remaining.toFixed(1)}초`:`${Math.ceil(e.hp)} / ${e.maxHp}`}</small></div>`;}).join('');
    }
    const counts=new Map();for(const e of game.enemies)if(e.hp>0)counts.set(e.type,(counts.get(e.type) || 0)+1);
    const intelKey=`${m.id}:${c.objectiveIndex}:${c.fortressBreaks}:${[...counts].join('|')}`;
    if(intelKey!==$('enemy-intel').dataset.key || force) {
      $('enemy-intel').dataset.key=intelKey;
      $('enemy-intel').innerHTML=counts.size?`<h3>현재 공세 정보</h3>${[...counts].map(([type,count])=>{const stats=enemyStats(game,{type});return `<div class="enemy-role"><strong>${stats.name} ×${count}</strong><span>장갑 ${Math.round(stats.armor*100)}% · 사거리 ${stats.range}m</span><p>${type==='leviathan'?bossTactics[stats.pattern].hint:enemyTactics[type]}</p></div>`;}).join('')}`:'<p>공세를 격퇴했습니다. 회수품과 다음 항로를 확인하세요.</p>';
    }
  }
  const decision=currentFieldDecision(game), choiceKey=c.pendingChoice?`${c.missionId}:${c.pendingChoice.site}:${game.resources}:${game.paused}`:'';
  const fieldIdentity=c.pendingChoice?`${c.missionId}:${c.pendingChoice.site}`:'';
  if(fieldIdentity && fieldIdentity!==lastFieldIdentity)showTab('voyage');
  lastFieldIdentity=fieldIdentity;
  const objectiveIdentity=`${c.missionId}:${c.objectiveIndex}`;
  if(objectiveIdentity!==lastObjectiveIdentity){ui.trackedSite=game.catalog[c.objectiveIndex]?.id || 'home';lastObjectiveIdentity=objectiveIdentity;}
  if(choiceKey!==$('field-choice').dataset.key || force) {
    $('field-choice').dataset.key=choiceKey;
    $('field-choice').innerHTML=decision?`<span class="eyebrow">FIELD DECISION</span><h3>${decision.title}</h3><p>${decision.text}</p>${decision.options.map(o=>{const recorded=isExploring(game)&&o.research&&atlasHasSurvey(c,game.operation.id,game.catalog[c.objectiveIndex].id),detail=recorded?'이미 보관한 조사 자료 · 다른 회수품을 선택하세요.':isExploring(game)&&o.research?`새 조사 자료를 귀환 시 보관 · 연구 +${o.research} · 자원 ${o.cost || 0} 소모`:o.detail;return `<button data-field-choice="${o.id}" ${recorded||game.paused||game.resources<(o.cost || 0)?'disabled':''}><strong>${o.name}</strong><small>${detail}</small></button>`;}).join('')}`:'';
  }
  for (const [id, def] of Object.entries(abilityDefinitions)) {
    const seconds = Math.ceil(c.abilityCooldowns[id] || 0), charges=c.abilityCharges?.[id]; document.querySelector(`[data-cooldown="${id}"]`).textContent = `${seconds?`${seconds}초`:'준비'}${charges===undefined?'':` · ${charges}회`}`;
    document.querySelector(`[data-ability="${id}"]`).disabled = !!seconds || charges===0 || !!c.pendingChoice || c.stage !== 'mission' || game.paused || game.phase !== 'playing' || (id==='brace'&&!c.hazards.length) || (id === 'mend' && game.hull >= game.maxHull && (!c.allyPosition || c.allyHull>=c.allyMaxHull));
  }
  const chartCount=atlasSummary(c).full,key = `${c.completed.join(',')}:${c.stage}:${c.research}:${JSON.stringify(c.tech)}:${game.paused}:${chartCount}`;
  if (force || key !== lastCampaignKey) {
    lastCampaignKey = key; const available = new Set(availableMissions(game).map(m => m.id));
    $('mission-list').innerHTML = chapters.map((ch, i) => `<details class="chapter-list" ${i === c.chapter ? 'open' : ''}><summary><span>${String(i+1).padStart(2,'0')}</span>${ch.name}<small>${c.completed.filter(id => getMission(id).chapter === i).length}/6</small></summary>${missions.filter(m => m.chapter === i).map(m => `<button class="mission-card ${c.completed.includes(m.id) ? 'complete' : ''}" data-mission="${m.id}" ${!available.has(m.id) || c.stage !== 'harbor' || game.paused ? 'disabled' : ''}><span class="mission-type">${{hunt:'사냥',salvage:'회수',defend:'방어',siege:'공격',relay:'복구',boss:'보스'}[m.kind]} ${c.completed.includes(m.id) ? '✓' : ''}</span><strong>${m.name}</strong><small>${m.description}</small><span class="mission-cost">◆ ${c.completed.includes(m.id) ? Math.floor(m.reward*0.4) : m.reward} + 처치 보상 ${c.completed.includes(m.id) ? '· 재탐사' : `· 연구 +${m.research}`}</span></button>`).join('')}</details>`).join('');
    $('research-points').textContent = `자료 ${c.research}`;
    $('research-list').innerHTML = technologies.map(t => { const level = c.tech[t.id] || 0,cost=researchCost(game,t),locked=c.chapter<(t.unlock || 0),required=researchChartRequirement(c,t),chartLocked=chartCount<required; return `<button data-research="${t.id}" class="research-card" ${c.stage !== 'harbor' || game.paused || locked || chartLocked || level >= t.max || c.research < cost.points || game.resources<cost.materials ? 'disabled' : ''}><span><strong>${t.name} ${level}/${t.max}</strong><small>${t.description}</small></span><b>${locked ? `${chapters[t.unlock].name} 해금` : level >= t.max ? '완료' : chartLocked?`완성 해도 ${chartCount}/${required}`:`자료 ${cost.points}${cost.materials?` · 자원 ${cost.materials}`:''}`}</b></button>`; }).join('');
  }
}
function update(force = false) {
  renderSites(); const rules = rulesFor(game), sites = sitesFor(game); updateCampaign(force);updateFleet();updateAtlas(force);
  $('resources').textContent = game.resources; $('hull-label').textContent = `${Math.ceil(game.hull)} / ${game.maxHull}`;
  const hullRatio = game.hull / game.maxHull; $('hull-fill').style.width = `${hullRatio * 100}%`; $('hull-fill').classList.toggle('low', hullRatio < 0.35);
  $('message').textContent = game.message; $('kill-count').textContent = `격파 ${game.kills} · 획득 ${game.earned}`;
  $('mode-label').textContent = game.mode === 'direct' ? 'A · 실시간 조종' : 'B · 목적지 선택';
  $('sea-state').textContent = game.paused ? '일시정지' : game.campaign?.stage === 'harbor' ? '정박지 · 정비와 연구' : game.campaign?.waitingForDeparture ? '현장 정비 · 출항 준비' : game.combat ? '교전 중 · 자동 공격' : game.route ? '항해 중 · 목적지로 이동' : '안전 해역 · 정비 가능';
  $('phase-dot').classList.toggle('combat', game.combat); $('cleared-count').textContent = `${game.sites.filter(s => s.cleared).length}/${game.sites.length}`;
  if(game.campaign?.stage==='harbor')$('cleared-count').textContent='';
  if (view) document.querySelector('.compass-arrow').style.transform = `rotate(${-view.yaw * 180 / Math.PI}deg)`;
  $('controls-hint').innerHTML = game.mode === 'direct' ? 'W A S D 이동 <span>·</span> 휠 확대 <span>·</span> 우클릭 드래그 회전' : '항로 선택으로 출항 <span>·</span> 교전 위치 고정 <span>·</span> 휠 확대';
  if(ui.commandMode)$('controls-hint').innerHTML=`${game.mode==='direct'?'W A S D 섬 이동 · ':''}드래그 선택 · 우클릭 이동/공격 · Alt+우클릭 회전 · C 시점`;
  if(game.campaign?.stage==='harbor' && game.mode==='direct')$('controls-hint').innerHTML='W A S D 정박지 이동 <span>·</span> 캠페인에서 임무 선택 후 출항';
  if(game.campaign?.pendingChoice)$('controls-hint').textContent='회수품을 선택하면 항해를 계속할 수 있습니다';
  if(game.operation?.kind==='defense')$('controls-hint').textContent='기지 방어 · 섬 정박 · 함대를 선택해 이동/공격';
  if(game.paused)$('controls-hint').textContent='일시정지 · 계속 항해하기 버튼 또는 P로 재개';
  $('voyage-note').textContent = game.mode === 'direct' ? '항로를 표시하고 직접 이동하세요.' : '정비를 마치고 출항할 곳을 선택하세요.';
  const manageable = canManage(game) && !game.paused;
  document.querySelectorAll('[data-tool]').forEach(b => {
    const weapon = rules.weapons[b.dataset.tool], cost = weapon?.cost ?? expansionCost(game);
    if (b.classList.contains('campaign-weapon')) b.hidden = !game.campaign || (!ui.showLocked && weapon?.unlock>game.campaign.chapter);
    if (b.classList.contains('build-card') && weapon) { b.querySelector('strong').textContent = weapon.name; b.querySelector('small').textContent = game.campaign && weapon.unlock > game.campaign.chapter ? `${weapon.unlock+1}번째 해역에서 해금` : `${weapon.description.split(' · ')[0]}${game.campaign ? ` · 전력 ${weapon.power}` : ''}`; b.querySelector('em').textContent = `◆ ${cost}`; }
    if (b.dataset.tool === 'expand') b.querySelector('small').textContent = `◆ ${cost}`;
    b.disabled = !manageable || game.resources < cost || (!!game.campaign && (weapon?.unlock > game.campaign.chapter || (weapon && powerUsed(game)+weapon.power > powerCapacity(game)))); b.classList.toggle('selected', b.dataset.tool === ui.tool);
  });
  $('show-designs').hidden = !game.campaign; $('show-designs').textContent = ui.showLocked?'잠긴 설계도 접기':'잠긴 설계도 보기';
  $('production-heading').hidden=!game.campaign;
  $('repair-button').querySelector('small').textContent = `◆ ${rules.repairCost}`;
  $('repair-button').disabled = !manageable || game.resources < rules.repairCost || game.hull >= game.maxHull;
  $('home-button').textContent = game.campaign ? '임무 포기 · 출항 전 상태로 정박지 복귀' : '⌂ 정박지로 귀환';
  $('home-button').disabled = game.campaign ? !['mission','operation'].includes(game.campaign.stage) || game.paused : game.mode === 'destination' && (game.combat || !!game.route || distance(game.island, { x: 0, z: 0 }) < 1);
  for (const s of sites) {
    const cleared = game.sites.find(a => a.id === s.id).cleared, b = document.querySelector(`[data-site="${s.id}"]`);
    b.disabled = cleared || (game.mode === 'destination' && (game.combat || !!game.route));
    if(game.operation?.kind==='defense' || (game.operation?.kind==='siege'&&game.operation.waiting))b.disabled=true;
    if(isExploring(game))b.disabled=cleared||!knownSite(game,s.id)||!!game.campaign.pendingChoice||game.paused||(!game.operation.waiting&&game.catalog[game.operation.round]?.id!==s.id)||!!game.route||game.combat;
    else if (game.campaign && game.catalog.length>1 && game.catalog[game.campaign.objectiveIndex]?.id !== s.id) b.disabled = true;
    if(game.campaign?.pendingChoice)b.disabled=true;
    b.textContent = cleared ? '✓ 해역 정리 완료' : game.route?.id === s.id ? '항해 중…' : game.mode === 'direct' ? '항로 표시 →' : '이곳으로 출항 →';
    document.querySelector(`[data-site-card="${s.id}"]`).classList.toggle('cleared', cleared);
    document.querySelector(`[data-site-card="${s.id}"]`).hidden=!!game.campaign && !$('show-route').checked && game.catalog[game.campaign.objectiveIndex]?.id!==s.id;
    if(isExploring(game))document.querySelector(`[data-site-card="${s.id}"]`).hidden=!knownSite(game,s.id);
    document.querySelector(`[data-distance="${s.id}"]`).textContent = `${Math.round(distance(game.island, s))} m`;
  }
  const selected = game.facilities.find(f => f.id === ui.selected);
  const facilityKey = selected ? `${selected.id}:${selected.level}:${Math.ceil(selected.hp ?? -1)}:${selected.targeting}:${selected.stock}:${selected.cropProgress}:${selected.catchUsed}:${Math.floor(selected.travel || 0)}:${selected.totalProduced}:${game.campaign?.surveyProgress}:${game.campaign?.bonusResearch}:${atShore(game,selected)}:${game.resources}:${manageable}:${game.campaign?.darknessSeconds>0}:${JSON.stringify(game.campaign?.buffs)}:${JSON.stringify(game.campaign?.tech)}` : `none:${game.facilities.length}`;
  if (force || facilityKey !== lastFacilityKey) {
    lastFacilityKey = facilityKey;
    if (selected) {
      const w = weaponStats(selected, game);
      $('facility-panel').innerHTML = `<div class="selected-heading"><span class="facility-icon ${selected.type}">${icon(selected.type)}</span><div><span class="eyebrow">SELECTED FACILITY</span><h3>${w.name} <em>Lv.${selected.level}</em></h3></div></div><div class="weapon-stats"><span>공격력 <b>${Math.round(w.damage*10)/10}</b></span><span>사거리 <b>${w.range}m</b></span><span>주기 <b>${w.interval}초</b></span></div><p>${w.description}${w.range>0?' · 황금빛 원이 적용 범위입니다.':''}</p><button data-action="upgrade" class="upgrade-button" ${!manageable || selected.level >= rules.maxLevel || game.resources < upgradeCost(selected,game) ? 'disabled' : ''}>${selected.level >= rules.maxLevel ? '최대 단계' : `강화하기 · ◆ ${upgradeCost(selected,game)}`}</button><div class="facility-secondary"><button data-action="move" ${!manageable ? 'disabled' : ''}>재배치 · 무료</button><button data-action="demolish" ${!manageable ? 'disabled' : ''}>철거 · 60% 회수</button></div>`;
      if(game.campaign) {
        if(selected.type==='wall'){
          $('facility-panel').querySelector('.weapon-stats').innerHTML=`<span>설치 면 <b>${wallEdges[wallEdge(selected)].name}</b></span><span>길이 <b>${balance.tileSize}m</b></span><span>내구도 <b>${structureHull(selected)}</b></span>`;
          $('facility-panel').insertAdjacentHTML('beforeend',`<p class="production-note">타일 (${selected.x}, ${selected.z})의 ${wallEdges[wallEdge(selected)].name} 면 · 반대편 이웃 면과 같은 성벽입니다. 파괴되면 뒤쪽 시설이 노출됩니다.</p>`);
        }
        if(selected.hp!==undefined){$('facility-panel').insertAdjacentHTML('beforeend',`<p class="facility-power">시설 내구도 ${Math.ceil(selected.hp)} / ${structureHull(selected)}${selected.hp===0?' · 파괴되어 작동하지 않습니다.':''}</p><button data-action="restore" class="upgrade-button" ${!manageable||structureRepairCost(selected)<=0||game.resources<structureRepairCost(selected)?'disabled':''}>${selected.type==='mine'&&selected.hp===0?'기뢰 재무장':'시설 복구'} · ◆ ${structureRepairCost(selected)}</button>`);if(selected.hp===0)$('facility-panel').querySelector('[data-action="upgrade"]').disabled=true;}
        if(w.damage===0 && selected.type!=='wall') {
          const stats=productionStats(selected,game),panel=$('facility-panel'),metrics=panel.querySelector('.weapon-stats');
          if(selected.type==='shipyard')metrics.innerHTML=`<span>함대 정원 <b>${fleetSupply(game)} / ${fleetCapacity(game)}</b></span><span>해금 선종 <b>${Object.values(unitTypes).filter(u=>u.unlock<=game.campaign.chapter && u.yardLevel<=selected.level).length}종</b></span><span>생산 <b>함대 메뉴</b></span>`;
          else if(selected.type==='shield')metrics.innerHTML=`<span>방호 <b>${30+(selected.level-1)*4}%</b></span><span>적용 범위 <b>${w.range}m</b></span><span>방향 <b>배치한 쪽</b></span>`;
          else if(selected.type==='workshop')metrics.innerHTML=`<span>자동 수리 <b>${selected.level*2}/초</b></span><span>조건 <b>교전 밖</b></span>`;
          else if(selected.type==='crane')metrics.innerHTML=`<span>추가 회수 <b>${Math.round(stats.recovery*100)}%</b></span><span>범위 <b>${stats.range}m</b></span><span>누적 생산 <b>${selected.totalProduced || 0}</b></span>`;
          else if(selected.type==='laboratory')metrics.innerHTML=`<span>조사 <b>${stats.samples}표본/유형</b></span><span>범위 <b>${stats.range}m</b></span><span>표본 <b>${game.campaign.surveyProgress || 0}/4</b></span>`;
          else if(['fishery','farm'].includes(selected.type))metrics.innerHTML=`<span>수확 보관 <b>◆ ${selected.stock || 0}</b></span><span>생산량 <b>${selected.type==='fishery'?stats.catchValue:stats.cropValue}/회</b></span><span>누적 생산 <b>${selected.totalProduced || 0}</b></span>`;
          if(selected.type==='fishery')panel.insertAdjacentHTML('beforeend',`<p class="production-note">${atShore(game,selected)?`어획 항해 ${Math.floor(selected.travel || 0)}/50m · 이번 원정 ${selected.catchUsed || 0}/${stats.catchCap}`:'섬 가장자리로 재배치하면 어획할 수 있습니다.'} · 정박 중에는 생산하지 않습니다.</p>`);
          if(selected.type==='farm')panel.insertAdjacentHTML('beforeend',`<p class="production-note">작물 성장 ${selected.cropProgress || 0}/3 목표 · 확보한 목표로 성장합니다.</p>`);
          if(selected.type==='laboratory')panel.insertAdjacentHTML('beforeend',`<p class="production-note">${game.campaign.stage==='harbor'?`보관한 표본 ${game.campaign.surveyArchiveProgress || 0}/4 · 출항 후 새로운 목표를 조사하세요.`:`유형마다 한 번 조사 · ${game.operation?.kind==='explore'?'새 지점의 귀환 시':'첫 임무 완료 시'} 추가 연구 ${game.campaign.bonusResearch || 0} · 실패하면 미완료 조사는 복구됩니다.`}</p>`);
          if(['fishery','farm'].includes(selected.type))panel.insertAdjacentHTML('beforeend',`<button data-action="collect" class="upgrade-button" ${!manageable || !(selected.stock>0)?'disabled':''}>수확하기 · ◆ ${selected.stock || 0}</button>`);
        }
        const delta=facilityPower({...selected,level:selected.level+1})-facilityPower(selected);
        if(powerUsed(game)+delta>powerCapacity(game)){$('facility-panel').querySelector('[data-action="upgrade"]').disabled=true;}
        $('facility-panel').insertAdjacentHTML('beforeend',`<p class="facility-power">전력 ${facilityPower(selected)} · 강화 후 ${facilityPower({...selected,level:Math.max(selected.level,Math.min(rules.maxLevel,selected.level+1))})} / 섬 용량 ${powerCapacity(game)}<br/>이 해역 최대 Lv.${rules.maxLevel} · 후반 해역에서 최대 9단계</p>${w.damage>0?`<label class="targeting-control">우선 공격 <select data-targeting ${!manageable?'disabled':''}>${Object.entries({nearest:'가까운 적',support:'복구·방호·증원',armored:'장갑이 강한 적',weakest:'내구도가 낮은 적'}).map(([id,name])=>`<option value="${id}" ${id===(selected.targeting || 'nearest')?'selected':''}>${name}</option>`).join('')}</select></label>`:''}`);
      }
    } else $('facility-panel').innerHTML = `<div class="empty-selection"><span>⌖</span><p>기존 시설을 클릭하면<br/>사거리와 강화 정보를 볼 수 있습니다.</p></div>`;
  }
  $('placement-panel').hidden = !ui.tool && !ui.board;
  $('board-toggle').setAttribute('aria-expanded',String(ui.board || !!ui.tool));$('board-toggle').textContent=ui.board?'배치도 접기':'배치도로 시설 선택';$('cancel-tool').hidden=!ui.tool;
  if(!ui.tool)$('placement-label').textContent='기존 시설 선택 · 강화와 수확';
  $('tool-tip').hidden = !ui.tool;
  const wallMode=ui.tool==='wall'||(ui.tool==='move'&&game.facilities.find(f=>f.id===ui.moving)?.type==='wall');
  $('wall-side-picker').hidden=!wallMode;
  document.querySelectorAll('[data-edge-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.edgeChoice===ui.edge)));
  if (ui.tool) {
    const label = wallMode ? `성벽 ${ui.tool==='move'?'재배치':'건설'} · 타일 면 선택` : ui.tool === 'expand' ? '섬 확장 · 가장자리 선택' : ui.tool === 'move' ? '시설 재배치 · 빈 타일 선택' : `${rules.weapons[ui.tool].name} · 빈 타일 선택`;
    $('placement-label').textContent = label; $('tool-tip').textContent = `${label}  /  Esc 취소`;
  }
  const boardKey = `${ui.tool}:${ui.selected}:${game.tiles.length}:${game.facilities.map(f => `${f.id},${f.x},${f.z},${f.edge},${f.hp===0}`).join(';')}`;
  if (force || boardKey !== lastBoardKey) {
    lastBoardKey = boardKey; const extension = new Set(expansionSlots(game).map(t => keyOf(t.x, t.z))); const tiles = new Set(game.tiles.map(t => keyOf(t.x, t.z)));
    let html = '';
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) {
      const exists = tiles.has(keyOf(x, z)), ghost = ui.tool === 'expand' && extension.has(keyOf(x, z)), f = game.facilities.find(f => f.type!=='wall'&&f.x === x && f.z === z), core = x === 0 && z === 0;
      const name=ghost?'확장':core?'중앙 기지':f?rules.weapons[f.type].name:'빈 타일';
      const faces=exists&&game.campaign?Object.entries(wallEdges).map(([edge,s])=>{
        const wall=wallAt(game,x,z,edge),label=`${x},${z} ${s.name} 면${wall?' 성벽':' 성벽 자리'}`;
        return `<button data-wall-edge="${edge}" data-x="${x}" data-z="${z}" class="tile-edge ${edge} ${wall?'built':''} ${wall?.hp===0?'broken':''} ${wall&&wall.id===ui.selected?'selected':''}" title="${label}" aria-label="${label}" ${!wall&&!wallMode?'disabled':''}></button>`;
      }).join(''):'';
      html += exists || ghost ? `<div class="tile-cell"><button data-tile="${keyOf(x, z)}" data-x="${x}" data-z="${z}" class="tile ${ghost ? 'extension' : ''} ${f ? 'occupied' : ''} ${core ? 'core' : ''}" title="${name} (${x}, ${z})" aria-label="${name} ${x},${z}" ${core&&!wallMode ? 'disabled' : ''}>${ghost ? '+' : core ? '⌂' : f ? icon(f.type) : '·'}</button>${faces}</div>` : '<span class="tile void"></span>';
    }
    $('tile-board').innerHTML = html;
  }
  const firstRemaining = sites.find(s => !game.sites.find(a => a.id === s.id)?.cleared);
  $('objective').textContent = game.campaign ? game.campaign.stage === 'harbor' ? `${getChapter(game).name} · 캠페인에서 다음 임무를 선택하세요.` : getMission(game.campaign.missionId)?.description : game.sites[0]?.cleared ? (firstRemaining ? `${firstRemaining.name}에 도전하기 전에 섬을 강화하세요.` : '모든 해역 정리 완료. 다른 이동 방식과 비교해 보세요.') : '시설을 준비하고 산호 여울로 향하세요.';
  if(game.operation){const def=getOperation(game.operation.id);$('objective').textContent=`${def.name} · ${def.description}`;}
  if (game.phase !== 'playing' && ui.started) {
    $('end-overlay').hidden = false; const won = game.phase === 'victory';
    $('end-eyebrow').textContent = won ? 'HORIZON REACHED' : 'THE SEA REMEMBERS';
    $('end-title').textContent = won ? '더 먼 바다를 향해' : '섬이 침몰했습니다';
    $('end-description').textContent = won ? '세 해역을 모두 정리했습니다. 다른 이동 방식에서도 같은 원정을 시험해 보세요.' : '출항 전 무장과 배치를 바꾸거나, 실시간 모드에서 거리를 조절해 보세요.';
    $('end-stats').textContent = `격파 ${game.kills}  ·  획득 자원 ${game.earned}  ·  시설 ${game.facilities.length}기`;
    if (game.campaign) {
    const m = getMission(game.campaign.missionId), victory = game.phase !== 'defeat';
      $('end-eyebrow').textContent = victory ? 'A NEW HORIZON' : 'REPLAN YOUR VOYAGE';
      $('end-title').textContent = game.phase === 'campaign-complete' ? '바다는 다시 길이 됩니다' : victory ? '항로를 확보했습니다' : game.message.startsWith('동맹') ? '정박지를 지키지 못했습니다' : '섬이 침몰했습니다';
      $('end-description').textContent = victory ? m?.kind === 'boss' ? chapters[m.chapter].ending : `${m?.name || getOperation(game.operation?.id)?.name} 완료. 정박지로 돌아가 시설과 연구를 준비하세요.` : '임무 재도전은 출항 전 섬과 자원으로 복구합니다. 이전 임무의 진행은 유지됩니다.';
      const reward=victory?game.campaign.resultReward:null;
      $('end-stats').textContent = `${game.campaign.completed.length}/72 임무 · 연구 자료 ${game.campaign.research} · 내구도 ${Math.ceil(game.hull)}/${game.maxHull}${reward?` · 이번 보상 ◆${reward.resources}, 연구 +${reward.research}${reward.bonusResearch?`(현장 조사 +${reward.bonusResearch})`:''}`:''}`;
      $('retry-button').textContent = victory ? '정박지로 돌아가기' : '같은 섬으로 다시 도전';
      $('compare-button').textContent = victory ? '캠페인 지도 보기' : '정박지에서 다시 준비';
      if(game.operation){const result=game.operation.result,siege=game.operation.kind==='siege';$('end-title').textContent=victory?siege?'거점을 확보했습니다':'기지를 지켰습니다':siege?'함대를 다시 준비하세요':'방어선을 다시 준비하세요';$('end-description').textContent=victory?siege?'세 기지의 지휘핵을 해체했습니다. 살아남은 함대와 생산물을 가지고 정박지로 돌아가세요.':'방어 기록을 확보했습니다. 손상 시설과 살아남은 함대를 정박지에서 복구하세요.':'재도전은 작전 시작 전 섬과 함대로 복구합니다.';if(result)$('end-stats').textContent=`${siege?'기지 3개 확보 · 보존':'방어'} ${result.score}점 · 시설 ${result.standing}/${result.total} · 이번 보상 ◆${reward?.resources || 0} · 연구 +${reward?.research || 0}`;}
      if(isExploring(game)){
        const r=game.operation.result;$('end-title').textContent=victory?'미지의 항로를 기록했습니다':'탐사대를 다시 준비하세요';
        $('end-description').textContent=victory?`이번 원정 ${r.surveyed}/8 지점 조사 · 보관 해도 ${r.chartSurveyed ?? r.surveyed}/8${r.chartReward?' · 해도 완성 보상 확보':''}. 살아남은 함대와 회수품을 가지고 정박지로 돌아갑니다.`:'재도전은 탐험 출항 전 섬·함대·자원으로 복구합니다.';
        if(victory)$('end-stats').textContent=`조사 ${r.surveyed}/8 · 기록 ${r.score}점 · 새 기록 ${r.newSurveys ?? r.surveyed}곳 · 귀환 함대 ${game.fleet.units.filter(u=>u.hp>0).length}기 · 이번 보상 ◆${reward.resources} · 연구 +${reward.research}`;
      }
    } else { $('retry-button').textContent = '같은 조건으로 다시 도전'; $('compare-button').textContent = '다른 이동 방식으로 비교'; }
    keys.clear();
  }
  updateDefense(force);drawMap();
}
let previous = performance.now(), lastUI = 0, lastSave = 0, lastPhase = game.phase;
const renderCadence=createRenderCadence();
function frame(now) {
  const dt = Math.min((now - previous) / 1000, 0.1); previous = now;
  if (ui.started && $('start-overlay').hidden && $('help-overlay').hidden) {
    const x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const z = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    advance(game, dt, { x, z });
  }
  audio.update(!ui.started || game.paused || game.phase!=='playing');
  for(const e of game.events)audio.event(e);
  const visualDt=renderCadence(now,{idle:game.paused||!ui.started||game.phase!=='playing',hidden:document.hidden});
  if(visualDt!==null)view?.render(game, ui, game.paused ? 0 : visualDt);
  if (now - lastUI > 120) { update(); lastUI = now; }
  if (now-lastSave > 5000 || lastPhase !== game.phase) { persist(); lastSave = now; lastPhase = game.phase; }
  requestAnimationFrame(frame);
}
update(true); requestAnimationFrame(frame);
// Read-only observability for browser tests; no state injection or instant wins.
if (import.meta.env.DEV) window.__TIDEHOLD__ = Object.freeze({ snapshot: () => structuredClone(game), projectTile: (x, z) => view.projectTile(x, z),projectWorld:p=>view.projectWorld(p),selection:()=>({units:[...ui.selectedUnits],commandMode:ui.commandMode,focus:ui.fleetFocus}), rendererInfo: () => ({ frames: view.renderer.info.render.frame, calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, geometries: view.renderer.info.memory.geometries, textures: view.renderer.info.memory.textures, enemyMeshes:view.enemies.size, enemyBars:view.bars.size,unitMeshes:view.units.size,powerLinks:view.powerLinks.visible?view.powerLinks.geometry.drawRange.count/2:0, bossVariants:[...view.enemies.values()].filter(m=>m.userData.boss).map(m=>m.userData.boss.variant) }) });

// Keep Tab within the active dialog. Escape follows the documented game controls.
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const overlay = [...document.querySelectorAll('.overlay')].reverse().find(n => !n.hidden); if (!overlay) return;
  const focusable = [...overlay.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(n=>n.offsetParent!==null);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1);
  if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
});
