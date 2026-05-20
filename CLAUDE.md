# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

이 레포지토리는 SmartThings용 cloud-to-cloud SmartApp 모음이다. 각 프로젝트는 독립된 디렉터리로 들어 있으며, 최상위 디렉터리 하나가 하나의 SmartApp(또는 관련 서비스)에 대응한다.

현재 포함된 프로젝트:

- `bus-tts-smartapp/` — 서울시 공공데이터포털 버스 도착 정보 API를 호출해, SmartThings 가상 디바이스 switch toggle을 트리거로 갤럭시 홈 미니에서 TTS 안내를 출력. SmartThings `API_ONLY` (OAuth-In) 패턴, Cloudflare Workers + KV 기반. 상세는 [`bus-tts-smartapp/README.md`](bus-tts-smartapp/README.md).

> 참고: 과거에는 SmartThings Edge Driver(`seoul-bus-stop-alarm/`)도 포함되어 있었으나, hub의 외부 인터넷 직접 호출이 platform 차원에서 차단되어 SmartApp(cloud-to-cloud) 구조로 옮겼다. 관련 의사결정은 `docs/` 참고.

## SmartApp Anatomy (`bus-tts-smartapp` 기준)

이 레포의 SmartApp은 Cloudflare Workers 위에서 SmartThings `API_ONLY` 앱으로 동작한다:

- `wrangler.toml` — Cloudflare Workers 설정 + KV binding (gitignore 대상, `wrangler.toml.example`에서 생성).
- `src/worker.js` — Workers entry. fetch 핸들러에서 OAuth/SmartApp lifecycle/디바이스 이벤트 라우팅.
- `src/smartapp.js` — SmartApp lifecycle (`PING`, `CONFIRMATION`, `CONFIGURATION`, `EVENT` 등) 처리.
- `src/oauth.js` — OAuth code 교환, refresh, `getValidAccessToken()`로 만료 시 자동 갱신.
- `src/storage.js` — KV 기반 토큰 저장 abstraction (로컬 테스트용 memory storage 포함).
- `src/subscription.js` — 디바이스 이벤트 구독 등록 (`switch.switch`).
- `src/smartthings.js` — SmartThings API로 디바이스 명령 전송 (TTS, switch off 등).
- `src/bus.js` — 서울시 공공데이터 버스 API 호출 + 안내 메시지 빌드.
- `profiles/*.yaml` — SmartThings device profile (가상 디바이스용, `switch` + 커스텀 capability).
- `test/*.test.js` — `node --test` 기반 단위 테스트.

SmartThings에 등록한 `API_ONLY` 앱은 worker의 `targetUrl`로 lifecycle 콜백을 보내고, worker는 KV에 보관한 `refresh_token`으로 access token을 갱신하며 양방향 호출을 처리한다.

## HTTP / 비동기 호출 규약

Cloudflare Workers V8 isolate 위에서 동작하므로 Node.js API가 아니라 **Web 표준 API**(`fetch`, `Request`, `Response`, `crypto.subtle`)를 사용한다. 외부 호출은 모두 글로벌 `fetch`로, JSON은 표준 `JSON.parse`/`response.json()`을 쓴다. `node:*` 모듈 import는 피하고, 꼭 필요한 경우 wrangler `compatibility_flags = ["nodejs_compat"]`을 검토할 것.

## 빌드 / 테스트 / 배포

```bash
# 단위 테스트 (node --test)
cd bus-tts-smartapp
npm install
npm test

# 로컬 실행 (Cloudflare Workers dev server)
wrangler dev

# 배포
wrangler deploy
```

CI/CD는 `main` push 시 GitHub Actions(`.github/workflows/deploy.yml`)가 GitHub Secret에서 `wrangler.toml` 생성 → `wrangler secret bulk`로 secret 동기화 → `wrangler deploy` 순으로 자동 실행한다. 등록해야 할 GitHub Secret 목록은 `bus-tts-smartapp/README.md`의 CI/CD 섹션 참고.

배포 후 동작 검증:

```bash
wrangler tail bus-tts-smartapp --format pretty   # 실시간 worker 로그
smartthings devices:status <device-id>           # SmartThings 측 상태
```

## 시크릿 / 자격증명 정책

`wrangler.toml`, `.env`, OAuth client secret, access/refresh token 등 비밀은 절대 레포에 커밋하지 않는다. 운영 비밀은 GitHub Secret + Cloudflare Worker secret(`wrangler secret put`)이 source of truth이고, 사용자 토큰은 Cloudflare KV에만 저장한다.
