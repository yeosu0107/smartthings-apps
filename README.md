# smartthings-apps

[![SmartThings](https://img.shields.io/badge/SmartThings-Cloud%20App-15bfff?logo=smartthings&logoColor=white)](https://developer.smartthings.com/docs/getting-started/welcome)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

SmartThings cloud-to-cloud 앱 모음. SmartThings 공식 `/apps` 카테고리(`WEBHOOK_SMART_APP` / `LAMBDA_SMART_APP` / `API_ONLY`)에 해당하는 프로젝트들을 담는다.

## 포함 프로젝트

| 프로젝트 | 설명 | 앱 타입 | 런타임 | 데이터 소스 |
|---|---|---|---|---|
| [`bus-tts-api/`](bus-tts-api/) | 서울시 버스 도착 정보를 SmartThings 가상 switch 토글로 트리거하여 갤럭시 홈 미니에서 TTS 출력 | `API_ONLY` (OAuth-In) | Cloudflare Workers + KV | 서울시 공공데이터포털 |
| [`weather-tts-api/`](weather-tts-api/) | 기상청 단기예보 + 에어코리아 미세먼지를 가상 switch 토글로 트리거하여 갤럭시 홈 미니에서 기상캐스터 톤 TTS 출력 | `API_ONLY` (OAuth-In) | Cloudflare Workers + KV | 기상청 + 에어코리아 |

각 프로젝트의 README에 setup / 배포 / CI/CD 절차가 정리되어 있다.

## SmartThings 앱 타입

| `AppType` | 성격 | Lifecycle 이벤트 |
|---|---|---|
| `WEBHOOK_SMART_APP` | 좁은 의미의 SmartApp. 모바일 앱에서 사용자가 install / configure | `PING`, `CONFIGURATION`, `INSTALL`, `UPDATE`, `EVENT` |
| `LAMBDA_SMART_APP` | 위와 동일하나 AWS Lambda 기반 | 동일 |
| `API_ONLY` | OAuth-In 통합. 모바일 앱에 install되지 않으며, 외부 서비스가 OAuth로 사용자 동의를 받아 SmartThings API를 직접 호출 | `PING`, `CONFIRMATION`, 디바이스 이벤트 |

본 레포의 프로젝트는 모두 `API_ONLY` 패턴을 따른다.

## 공통 스택

| 영역 | 사용 기술 |
|---|---|
| 런타임 | Cloudflare Workers (V8 isolate, Web 표준 `fetch` API) |
| 스토리지 | Cloudflare KV (OAuth 토큰 영속화) |
| 인증 | SmartThings OAuth-In (authorization code + refresh token) |
| 테스트 | `node --test` (Node.js built-in test runner) |
| 배포 | `wrangler deploy` + GitHub Actions (`workflow_dispatch` 수동 트리거) |

## License

[MIT](./LICENSE) © sungwoo yeo
