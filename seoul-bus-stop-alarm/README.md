# Seoul Bus Alarm — SmartThings Edge Driver

서울시 공공데이터포털의 버스 도착 정보 API를 호출해 등록한 정류소(ARS-ID)의 도착 안내 문장을 SmartThings 디바이스 attribute로 노출하고, 동시에 지정한 SmartThings 스피커(예: 갤럭시 홈 미니)에 같은 안내를 음성으로 송출하는 Edge Driver다.

## 동작 개요

- 트리거: SmartThings 앱의 디바이스 상세 화면에서 momentary 버튼을 push.
- 처리: `https://ws.bus.go.kr/api/rest/stationinfo/getStationByUid` 를 비동기로 호출해 응답을 한글 안내 문장으로 합성.
- 출력:
  1. 커스텀 capability `waterabout01957.busmessage` 에 안내 문장 emit (디바이스 화면 표시용).
  2. preference에 등록한 스피커 device로 `speechSynthesis.speak` 명령을 전송 (음성 안내).

> SmartThings 표준 Routine은 트리거 attribute의 동적 값을 액션 인자(텍스트)로 변수 치환할 수 없다. 따라서 capability emit만으로는 매번 다른 안내문을 스피커로 흘릴 수 없으며, 본 드라이버는 SmartThings cloud API에 직접 명령을 송신하는 경로로 그 한계를 우회한다.

폴링은 수행하지 않는다. 주기적 갱신이 필요하면 SmartThings 자동화에서 시간 트리거 + Momentary push 액션으로 구성한다.

## 사전 준비

| 항목 | 비고 |
| --- | --- |
| 공공데이터포털 ServiceKey | [data.go.kr](https://www.data.go.kr) "서울특별시\_정류소정보조회 서비스" 활용신청 후 발급. |
| 정류소 ARS-ID | 정류장 표지판 또는 서울 버스 앱에서 확인 가능한 5자리 번호. |
| 커스텀 capability `waterabout01957.busmessage` | SmartThings 개발자 워크스페이스에 사전 등록되어 있어야 한다. |
| OAuth-In SmartApp | 동일 워크스페이스에 직접 등록. Redirect URI는 본인 Netlify broker 사이트의 `/api/callback`. Scopes는 `r:devices:* x:devices:*` 권장. |
| OAuth broker 배포 | 본 레포지토리의 `oauth-broker/` 디렉터리를 Netlify에 배포. `.github/workflows/deploy-oauth-broker.yml` 로 자동 배포 가능. |
| TTS 대상 스피커의 deviceId | `smartthings devices` 로 확인 후 본 드라이버 preference에 입력. |

## 설정 (Preferences)

| Preference | 키 | 설명 |
| --- | --- | --- |
| 공공데이터포털 API Key | `apiKey` | 발급받은 ServiceKey. |
| 정류소 ID (ARS-ID) | `stationId` | 조회할 서울 버스 정류소 번호. |
| SmartThings Refresh Token | `refreshToken` | OAuth broker 사이트에서 한 번 발급받아 붙여 넣음. |
| 스피커 Device ID | `speakerDeviceId` | TTS를 재생할 스피커의 device ID. |

`refreshToken`/`speakerDeviceId`가 비어 있으면 음성 송출은 생략하고 attribute emit만 동작한다.

## 토큰 흐름

1. 사용자가 broker 사이트에서 "Connect to SmartThings"를 누른다.
2. SmartThings에 로그인·동의 후 `refresh_token` 이 화면에 1회 표시된다 (broker 측 저장 없음).
3. 그 값을 본 드라이버의 `Refresh Token` preference에 붙여 넣는다.
4. 이후 momentary push 시:
   - 캐시된 access_token이 만료 임박이면 broker `/api/refresh` 로 새 토큰을 받아 hub의 device persistent field에 저장.
   - 받은 access_token으로 SmartThings cloud API에 `speechSynthesis.speak` 명령을 직접 송신.
5. refresh 응답에 새 refresh_token이 포함되면(rotation) hub field가 갱신되어 다음 갱신 때 자동 사용된다. preference의 초기 토큰은 변경하지 않으나, 30일 이상 미사용으로 만료되면 사이트에서 다시 발급해 preference를 덮어쓰면 된다.

## 패키징·배포 (드라이버)

```bash
# 패키지 검증 및 업로드
smartthings edge:drivers:package seoul-bus-stop-alarm

# 채널 할당
smartthings edge:channels:assign

# 허브에 설치
smartthings edge:drivers:install

# 실시간 로그 확인
smartthings edge:drivers:logcat <driverId>
```

`src/init.lua` 의 `BROKER_BASE_URL` 상수는 본인 Netlify 사이트 URL 로 교체해야 한다.

## 디렉터리 구조

```
seoul-bus-stop-alarm/
├── config.yml                # 패키지 메타데이터
├── profiles/
│   └── bus-profile.yaml      # capability·preferences 선언
└── src/
    └── init.lua              # 드라이버 엔트리포인트
```

본 레포지토리 루트의 `oauth-broker/` 디렉터리에 Netlify 측 정적 페이지·서버리스 함수가 함께 들어 있다.
