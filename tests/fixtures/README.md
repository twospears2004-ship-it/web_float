# 고정 회귀 검사 입력

`atlas-legacy-journey.json`은 해도 기록 기능 이전에 새 섬 하나로72캠페인·96외해 작전을 정상 행동으로 완료한 정박지 저장의 원본 복사본입니다. 자원·체력·위치·시간·처치를 변경하지 않았습니다. 당시 엔진 소스 SHA-256은 `cabfe9cb6eda5e97580ec427343f1e166ae3cab25bf1e87edd0e8d08364c1d7d`입니다. 검증 기록은 `CAMPAIGN_VALIDATION.md`의 이전 연속 실행에 있습니다.

이 파일은 이전 형식의 해도 복원·자원 보존·재접속 회귀 검사용이며 최신 엔진의 분량이나 사람의20시간 플레이 증거가 아닙니다. 새 모델 실행이 `artifacts/journey-final.json`을 갱신해도 이 호환성 픽스처는 유지합니다.

원본과 복사본의 파일 SHA-256: `05ee9d2cc3721b04fd91f3da82f06e407d7c56fdc12d4e2956743d5896ac1509`. 원본 경로를 이 고정 픽스처로 옮긴 후 해당 브라우저 호환성 검사1/1도 통과했습니다(9.8초).


`walls-legacy-coral-harbor.json`은 농장 조기 해금·면 성벽 기능 이전에 정상 행동으로 첫 해역6임무를 완료한 생산 섬 정박지 저장의 원본 복사본입니다. 원본 `artifacts/colony-fixtures/coral-6-harbor.json`의 바이트와 일치하며 자원661·시설5개·완료6임무를 변경하지 않았습니다. SHA-256: `ed1f8659943123f7ef2e88b156f8be263f1dce1bc24316d3d01f14a39b2b12be`. 기존 사용자 섬에 농장과 면 성벽을 건설하는 UI 호환성 검사에서 사용합니다. 새로운 `audit:colony` 실행이 이전 시나리오의 입력을 덮어쓰지 않도록 이 파일을 유지합니다. 새로운 게임의 농장 첫 수확은 별도의 새 게임 UI 및 `scripts/audit-walls.mjs`로 검사합니다.

`render-model-baseline.json`은 그래픽 호출을 묶기 전에 자체 절차적 모델에서 기록한16개 외형의 경계·재질별 삼각형 수·원래 메시 수입니다. 타일 하나와 성벽/연사포/농장/크레인/연구소의1/5/9단계를 포함합니다. 묶기 후에도 외형의 크기·색별 삼각형·타일 클릭 영역과 작물/회수품/포탑의 독립 객체를 보존하는지 확인하며 저장이나 플레이 시간 증거가 아닙니다. 고정 파일 SHA-256: `598dd47670c832f83664b050613719dd0dd3f4a9bcd658ce01c66538b21ebe8c`.
# 엔딩 이후 송전망 결과

`endgame-earned-coral-network-result.json`은 `artifacts/journey-network-current/journey-fixtures/siege-coral-4-result.json`의 고정 복사본입니다. 정상 새 섬에서 이야기72개와 기존 외해96개를 순서대로 완료하고 실제 출항 비용·정비·함대 손실을 적용한 뒤 얻은 첫 특수 공략 결과입니다. 자원53703, 함대5척이며 자원·체력·피해·해금 지급이나 중간 가져오기 없이 생성했습니다.

게임 소스 SHA-256 `c6cd23ce21857f2695316b4b9011acd98b08796882ceb568576f49f372f6af04`, 검사기 `ac84abb2574a2c554133a457123349566e6cdce87697cb26878d114230df147e`, 파일 SHA-256 `af5c913f1252447a62bc96853754b754e7c91810ec4564694142fc866c7e1c85`입니다. 모델의 고정 간격 실행으로 생성한 저장이며 실제 시간의192개 화면 플레이 근거는 아닙니다. 브라우저/PC의 결과 복구와 세 지휘핵 해금·진행 중 저장 회귀에만 공개 가져오기 UI로 사용합니다. 기존 픽스처를 교체하지 않습니다.

# 실제 시간 공략의 격침 함선

`live-earned-coral-siege-casualty.json`은 고정 소스 `c6cd23ce21857f2695316b4b9011acd98b08796882ceb568576f49f372f6af04`의 새 섬에서 실제 시간으로 이야기6·방어3·공략1을 완료한 뒤, 두 번째 공략의 전용 검사 프로필에 정상 자동 저장된 원본입니다. 자원718·임무38.416667초, 격침된1번 요격정과 살아 있는2/3번 함선의 실제 공격 명령을 보존합니다. 두 살아 있는 함선에게 공격 명령이 전달됐는데도 검사기가 격침된1번까지 명령 일치를 요구해 잘못 실패했던 상태입니다.

종료1이 확인된 자체 프로필의 정상 이어하기와 읽기 전용 관찰로 검증·복사했습니다. 가상 시계·지급·피해·진행/위치 변경으로 생성하지 않았습니다. 파일 SHA-256 `3ec086be756a33a73a329375d08814a492ed12402cae00bc182212707262183e`. `artifacts/live-network-full-20261011/run-2/pointer-failure-inspection.json`과 실패 구간 `run-2/`에 근거가 있습니다. 실제 시간 장편 완주의 증거가 아닌 검사기 명령 경계 회귀 입력이며 이전 픽스처를 교체하지 않습니다.


# Actual-time partial engagement route recovery

`live-earned-frost-route-gap.json` is an unchanged copy of the isolated rendered run's own normal paused save, `artifacts/live-network-full-20261011/run-5/failure-state.json`. The frozen game source is c6cd23ce21857f2695316b4b9011acd98b08796882ceb568576f49f372f6af04. The operator used the runner's cooperative stop request; the game was paused and saved before its browser closed. The save has 16 completed sorties, Frost3 at 327.5000000000308 seconds, resources818, three living paid ships, one killed guard and two inactive guards at the next shore. No balances, health, positions or commands were edited. It demonstrates that restoring an already initiated partial encounter does not mean the island has sailed to that shore. SHA-256: `8ec8a95e973fea2655a308da8f4334ecb04d3a82aaca2b0e40e1a0dc51665987`. Evidence: `artifacts/live-network-full-resume5.log`, `artifacts/live-network-full-20261011/run-5/combat-gap-inspection.json`.

# Earned split-supply network result

`endgame-variety-earned-frost-network-result.json` is an unchanged copy of the normal continuous model's completed Frost network, `artifacts/endgame-variety-prototype-20261011/artifacts/journey-variety-current/journey-fixtures/siege-frost-4-result.json`. Game source SHA-256: `46dae62e05df14fab32ccad5b9e2dc774153000718fb30a9be76614af4fe4c52`. Controller SHA-256: `ac84abb2574a2c554133a457123349566e6cdce87697cb26878d114230df147e`. It contains 72 completed stories and99 frontier sorties, resources44662 and5 paid surviving ships. The guards, generators and supply districts were saved by the normal gameplay model; no balance, health, positions or commands were edited. This is simulation evidence, not full actual-time or human playtime evidence. SHA-256: `ef915b6f87c147f0aa25134aa3bed611c2b67bbc8378d9ac93d954b0fd53a858`. The browser/native tests verify that result's import, a new paid departure, flank supplies and cache-loss recovery.

# Actual-time survey transition

`live-earned-survey-transition.json` is an unchanged normal paused save from `artifacts/live-network-full-20261011/run-6/failure-state.json`. Source SHA-256: `c6cd23ce21857f2695316b4b9011acd98b08796882ceb568576f49f372f6af04`. It has26 completed sorties and an active Frost exploration at62.566666666664396 seconds, resources338, four surviving paid ships, and the ammunition choice from the surveyed second node. The survey button correctly became disabled when the choice opened; the old controller mistook the normal transition for a click error. No gameplay values were edited. Fixture SHA-256: `8644363f11b6fccac3ea80d43d1aa4b659d1a0ee4f0a9fa5846e8d323841c7af`. Evidence: `artifacts/live-network-full-resume6.log`; the controller resumes that same earned choice through normal public controls.

# Legacy exploration layout boundary

`exploration-legacy-coral-active.json` is an unchanged copy of `artifacts/exploration-fixtures/explore-coral-1-node-2-start.json`, generated by the earlier normal paid exploration audit. It has resources511, two paid scouts, one surveyed node and the original unversioned active map. It checks old coordinates, ships, costs and partial survey restoration; it does not prove the new layout's economy or play length. New layout mechanics use separately labeled isolated tests, and a fresh continuous journey plus public UI for normal progression evidence.

