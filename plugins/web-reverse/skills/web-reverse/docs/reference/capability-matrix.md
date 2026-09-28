<!-- publish: framework -->
# Capability Matrix

The canonical topic source now lives under `topics/<topic>/topic.json`.
`docs/reference/topic-route-matrix.json` is a generated registry view for QA, publish, and review.
Maturity semantics and promotion rules are documented in `docs/reference/maturity-model.md`.

## Maturity Summary

- `synthetic-e2e`: `22` 个专题；结构化任务模型、formal validation、专题 QA 与 synthetic 回归全部已具备。
- `closed-loop`: `13` 个专题；结构化任务模型、formal validation 与专题 QA 已具备，但 synthetic 回归尚未发布。
- `guided`: `0` 个专题；已有 registry-backed 路由与专题指导，但闭环执行契约仍未达到 closed-loop。
- `reference-only`: `0` 个专题；已有参考资料，但尚无 registry-backed 的执行契约。

## Topic Table

| Topic | Maturity | Owner | Risk | Route | Required Checks |
|---|---|---|---|---|---|
| `anti-debug` | `synthetic-e2e` | `web-reverse-core` | `high` | `anti-debug` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `behavior-telemetry` | `synthetic-e2e` | `web-reverse-core` | `high` | `behavior-telemetry` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `binary-codec` | `synthetic-e2e` | `web-reverse-core` | `high` | `binary-codec` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `challenge-orchestration` | `synthetic-e2e` | `web-reverse-core` | `high` | `challenge-orchestration` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`, `check:algo-selfcheck` |
| `compression-stream` | `synthetic-e2e` | `web-reverse-core` | `medium` | `compression-stream` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `dynamic-code` | `synthetic-e2e` | `web-reverse-core` | `high` | `dynamic-code` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `env` | `synthetic-e2e` | `web-reverse-core` | `medium` | `env` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `fingerprint` | `synthetic-e2e` | `web-reverse-core` | `high` | `fingerprint` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `framework-runtime` | `synthetic-e2e` | `web-reverse-core` | `high` | `framework-runtime` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `graphql-rpc` | `synthetic-e2e` | `web-reverse-core` | `high` | `graphql-rpc` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `instrumentation-hooking` | `synthetic-e2e` | `web-reverse-core` | `high` | `instrumentation-hooking` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `jsvmp` | `synthetic-e2e` | `web-reverse-core` | `high` | `jsvmp` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`, `check:algo-selfcheck` |
| `media-drm` | `synthetic-e2e` | `web-reverse-core` | `high` | `media-drm` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `miniapp` | `synthetic-e2e` | `web-reverse-core` | `high` | `miniapp` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`, `check:algo-selfcheck` |
| `module-federation` | `synthetic-e2e` | `web-reverse-core` | `high` | `module-federation` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `protocol` | `synthetic-e2e` | `web-reverse-core` | `high` | `protocol` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `signature` | `synthetic-e2e` | `web-reverse-core` | `high` | `signature` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`, `check:algo-selfcheck` |
| `streaming-runtime` | `synthetic-e2e` | `web-reverse-core` | `high` | `streaming-runtime` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `subtlecrypto` | `synthetic-e2e` | `web-reverse-core` | `high` | `subtlecrypto` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `userland-crypto` | `synthetic-e2e` | `web-reverse-core` | `high` | `userland-crypto` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `wasm` | `synthetic-e2e` | `web-reverse-core` | `high` | `wasm` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `worker` | `synthetic-e2e` | `web-reverse-core` | `medium` | `worker` | `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e` |
| `anti-tamper` | `closed-loop` | `web-reverse-core` | `high` | `anti-tamper` | `check:topic-manifests`, `check:capability-coverage` |
| `ast-deobfuscation` | `closed-loop` | `web-reverse-core` | `high` | `ast-deobfuscation` | `check:topic-manifests`, `check:capability-coverage` |
| `beacon-reporting` | `closed-loop` | `web-reverse-core` | `medium` | `beacon-reporting` | `check:topic-manifests`, `check:capability-coverage` |
| `bundle-loader` | `closed-loop` | `web-reverse-core` | `medium` | `bundle-loader` | `check:topic-manifests`, `check:capability-coverage` |
| `cross-context-coordination` | `closed-loop` | `web-reverse-core` | `high` | `cross-context-coordination` | `check:topic-manifests`, `check:capability-coverage` |
| `frame` | `closed-loop` | `web-reverse-core` | `medium` | `frame` | `check:topic-manifests`, `check:capability-coverage` |
| `grpc-web` | `closed-loop` | `web-reverse-core` | `high` | `grpc-web` | `check:topic-manifests`, `check:capability-coverage` |
| `microfrontend-runtime` | `closed-loop` | `web-reverse-core` | `high` | `microfrontend-runtime` | `check:topic-manifests`, `check:capability-coverage` |
| `session` | `closed-loop` | `web-reverse-core` | `medium` | `session` | `check:topic-manifests`, `check:capability-coverage` |
| `source-map` | `closed-loop` | `web-reverse-core` | `medium` | `source-map` | `check:topic-manifests`, `check:capability-coverage` |
| `storage` | `closed-loop` | `web-reverse-core` | `medium` | `storage` | `check:topic-manifests`, `check:capability-coverage` |
| `webauthn-passkey` | `closed-loop` | `web-reverse-core` | `high` | `webauthn-passkey` | `check:topic-manifests`, `check:capability-coverage` |
| `webrtc-datachannel` | `closed-loop` | `web-reverse-core` | `high` | `webrtc-datachannel` | `check:topic-manifests`, `check:capability-coverage` |

## Topic Detail

### `anti-debug`

- 名称: Anti-debug
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `anti-debug`
- 协议文档: `references/anti-debug-playbook.md`
- 必需 signals: `debugger`, `DevTools`, `preload`, `runtime`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-anti-debug-workflow.mjs`

### `behavior-telemetry`

- 名称: Behavior telemetry / interaction traces
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `behavior-telemetry`
- 协议文档: `references/behavior-telemetry-playbook.md`
- 必需 signals: `mousemove`, `scroll cadence`, `focus`, `visibilitychange`, `input rhythm`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-behavior-telemetry-workflow.mjs`

### `binary-codec`

- 名称: Binary codec / schema reconstruction
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `binary-codec`
- 协议文档: `references/binary-codec-playbook.md`
- 必需 signals: `protobuf`, `msgpack`, `cbor`, `flatbuffers`, `varint`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-binary-codec-workflow.mjs`

### `challenge-orchestration`

- 名称: Challenge routing / token orchestration
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `challenge-orchestration`
- 协议文档: `references/challenge-orchestration-playbook.md`
- 必需 signals: `challenge token`, `captcha`, `turnstile`, `risk route`, `silent challenge`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`, `check:algo-selfcheck`
- caseFiles: `web-challenge-orchestration-workflow.mjs`

### `compression-stream`

- 名称: Compression / decompression boundary
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `medium`
- 路线轨道: `compression-stream`
- 协议文档: `references/compression-stream-playbook.md`
- 必需 signals: `gzip`, `deflate`, `brotli`, `CompressionStream`, `DecompressionStream`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-compression-stream-workflow.mjs`

### `dynamic-code`

- 名称: Dynamic code / eval unpacking
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `dynamic-code`
- 协议文档: `references/dynamic-code-playbook.md`
- 必需 signals: `eval`, `Function`, `string timer`, `dynamic import`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-dynamic-code-workflow.mjs`

### `env`

- 名称: Env conformance / host behavior
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `medium`
- 路线轨道: `env`
- 协议文档: `references/env-conformance-playbook.md`
- 必需 signals: `first divergence`, `descriptor`, `queueMicrotask`, `typed array`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-env-conformance-workflow.mjs`, `web-node-env-patching-workflow.mjs`

### `fingerprint`

- 名称: 指纹 / 自动化检测画像
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `fingerprint`
- 协议文档: `references/fingerprint-playbook.md`
- 必需 signals: `fingerprint`, `anti-bot`, `webdriver`, `userAgentData`, `canvas`, `webgl`, `audio`, `fonts`, `timezone`, `screen`, `navigator`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-fingerprint-workflow.mjs`

### `framework-runtime`

- 名称: Framework runtime / SSR-CSR boundary
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `framework-runtime`
- 协议文档: `references/framework-runtime-playbook.md`
- 必需 signals: `Next.js`, `Nuxt`, `Remix`, `Vite`, `SvelteKit`, `Astro`, `__NEXT_DATA__`, `hydration`, `import.meta`, `modulepreload`, `island`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-framework-runtime-workflow.mjs`

### `graphql-rpc`

- 名称: GraphQL / persisted query / APQ
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `graphql-rpc`
- 协议文档: `references/graphql-rpc-playbook.md`
- 必需 signals: `/graphql`, `query`, `mutation`, `operationName`, `extensions.persistedQuery`, `sha256Hash`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-graphql-rpc-workflow.mjs`

### `instrumentation-hooking`

- 名称: Instrumentation / hooking / trace
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `instrumentation-hooking`
- 协议文档: `references/instrumentation.md`
- 必需 signals: `fetch`, `XHR`, `WebSocket`, `sendBeacon`, `eval`, `Function`, `postMessage`, `cookie setter`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-instrumentation-hooking-workflow.mjs`

### `jsvmp`

- 名称: JS-VMP / custom VM
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `jsvmp`
- 协议文档: `references/vmp-playbook.md`
- 必需 signals: `dispatcher`, `opcode`, `bytecode`, `handler table`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`, `check:algo-selfcheck`
- caseFiles: `web-vm-generic-template-workflow.mjs`, `web-jsvmp-devirtualization-workflow.mjs`, `web-vm-wasm-workflow.mjs`

### `media-drm`

- 名称: Media DRM / EME / license flow
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `media-drm`
- 协议文档: `references/media-drm-playbook.md`
- 必需 signals: `MediaSource`, `encrypted event`, `requestMediaKeySystemAccess`, `license`, `m3u8`, `mpd`, `video frame`, `decrypt`, `clearkey`, `SourceBuffer`, `key session`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-media-drm-workflow.mjs`

### `miniapp`

- 名称: Miniapp（小程序）逆向：包获取/解密解包、双线程运行时取证、接口与签名复现（微信为主战场，支付宝/抖音/百度/QQ 矩阵化覆盖）
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `miniapp`
- 协议文档: `references/miniapp-playbook.md`
- 必需 signals: `小程序`, `miniapp`, `miniprogram`, `mini-program`, `wxapkg`, `V1MMWX`, `app-service.js`, `app-config.json`, `AppService`, `subPackages`, `getApp`, `requirePlugin`, `plugin-private`, `page-frame.html`, `servicewechat.com`, `wx.request`, `wx.login`, `xwechat`, `appbrand`, `WMPF`, `RadiumWMPF`, `mmtls`, `合法域名`, `支付宝小程序`, `my.request`, `axml`, `抖音小程序`, `tt.request`, `TPKG`, `ttpkg`, `百度智能小程序`, `swan.request`, `QQ小程序`, `qq.request`, `KillWxapkg`, `unveilr`, `wxappUnpacker`, `wx-mp`, `miniapp-cdp`, `WMPFDebugger`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`, `check:algo-selfcheck`
- caseFiles: `web-miniapp-workflow.mjs`, `web-miniapp-sign-workflow.mjs`

### `module-federation`

- 名称: Module federation / remote runtime
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `module-federation`
- 协议文档: `references/module-federation-playbook.md`
- 必需 signals: `remoteEntry.js`, `__webpack_init_sharing__`, `container.get`, `share scope`, `remote module`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-module-federation-workflow.mjs`

### `protocol`

- 名称: Protocol / replay
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `protocol`
- 协议文档: `references/protocol-playbook.md`
- 必需 signals: `websocket`, `sse`, `webtransport`, `datagram`, `stream`, `schema`, `replay`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-protocol-workflow.mjs`

### `signature`

- 名称: Request signature / parameter reconstruction
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `signature`
- 协议文档: `references/signature-playbook.md`
- 必需 signals: `sign`, `signature`, `hmac`, `timestamp`, `nonce`, `canonical string`, `x-sign`, `x-t`, `request acceptance`, `signer state`, `x-ms-token`, `msToken`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`, `check:algo-selfcheck`
- caseFiles: `web-signature-workflow.mjs`

### `streaming-runtime`

- 名称: Streaming runtime / incremental execution
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `streaming-runtime`
- 协议文档: `references/streaming-runtime-playbook.md`
- 必需 signals: `ReadableStream`, `TransformStream`, `TextDecoderStream`, `incremental decode`, `stream pipeline`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-streaming-runtime-workflow.mjs`

### `subtlecrypto`

- 名称: SubtleCrypto / key lifecycle
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `subtlecrypto`
- 协议文档: `references/subtlecrypto-playbook.md`
- 必需 signals: `crypto.subtle`, `importKey`, `deriveKey`, `sign`, `digest`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-subtlecrypto-workflow.mjs`

### `userland-crypto`

- 名称: Userland crypto / algorithm extraction
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `userland-crypto`
- 协议文档: `references/userland-crypto-playbook.md`
- 必需 signals: `CryptoJS`, `AES.encrypt`, `MD5`, `SHA256`, `RSAKey`, `WordArray`, `Base64.parse`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-userland-crypto-workflow.mjs`

### `wasm`

- 名称: WASM runtime
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `wasm`
- 协议文档: `references/wasm-runtime-playbook.md`
- 必需 signals: `instantiate`, `instantiateStreaming`, `glue`, `memory`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-wasm-runtime-workflow.mjs`

### `worker`

- 名称: Worker / Service Worker
- 成熟度: `synthetic-e2e`
- 维护方: `web-reverse-core`
- 风险等级: `medium`
- 路线轨道: `worker`
- 协议文档: `references/worker-playbook.md`
- 必需 signals: `worker`, `service worker`, `postMessage`, `Blob`, `createObjectURL`, `importScripts`, `workbox`, `fetch event`, `navigation preload`, `clients.claim`, `skipWaiting`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`, `check:synthetic-e2e`
- caseFiles: `web-worker-workflow.mjs`

### `anti-tamper`

- 名称: Integrity / Trusted Types / hook resistance
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `anti-tamper`
- 协议文档: `references/anti-tamper-playbook.md`
- 必需 signals: `integrity`, `self-check`, `Trusted Types`, `CSP`, `SRI`, `hook seal`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-anti-tamper-workflow.mjs`

### `ast-deobfuscation`

- 名称: AST deobfuscation / semantic recovery
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `ast-deobfuscation`
- 协议文档: `references/ast-deobfuscation.md`
- 必需 signals: `while(true)+switch`, `string array`, `_0x`, `eval(pack)`, `rotator`, `dispatcher object`, `control flow flattening`, `string array rotator`, `dead code injection`, `hexadecimal string literals`, `self-defending`, `console output disabled`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-ast-deobfuscation-workflow.mjs`

### `beacon-reporting`

- 名称: Beacon / reporting / hidden telemetry
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `medium`
- 路线轨道: `beacon-reporting`
- 协议文档: `references/beacon-reporting-playbook.md`
- 必需 signals: `sendBeacon`, `report-to`, `ReportingObserver`, `visibilitychange`, `pagehide`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-beacon-reporting-workflow.mjs`

### `bundle-loader`

- 名称: Bundle / chunk loader
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `medium`
- 路线轨道: `bundle-loader`
- 协议文档: `references/bundle-loader-playbook.md`
- 必需 signals: `webpackJsonp`, `__webpack_require__`, `chunk loader`, `dynamic import`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-bundle-loader-workflow.mjs`

### `cross-context-coordination`

- 名称: Cross-context coordination / message graph
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `cross-context-coordination`
- 协议文档: `references/cross-context-coordination-playbook.md`
- 必需 signals: `BroadcastChannel`, `storage event`, `SharedArrayBuffer`, `Atomics`, `AudioWorklet`, `PaintWorklet`, `OffscreenCanvas`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-cross-context-coordination-workflow.mjs`

### `frame`

- 名称: Frame / iframe
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `medium`
- 路线轨道: `frame`
- 协议文档: `references/frame-playbook.md`
- 必需 signals: `iframe`, `frame`, `postMessage`, `cross-frame`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-frame-workflow.mjs`

### `grpc-web`

- 名称: gRPC-Web / Connect-Web / protobuf over HTTP
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `grpc-web`
- 协议文档: `references/grpc-web-playbook.md`
- 必需 signals: `application/grpc-web`, `x-grpc-web`, `grpc-status`, `proto`, `trailers`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-grpc-web-workflow.mjs`

### `microfrontend-runtime`

- 名称: Microfrontend runtime / remote loader
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `microfrontend-runtime`
- 协议文档: `references/microfrontend-runtime-playbook.md`
- 必需 signals: `System.import`, `importmap`, `single-spa`, `qiankun`, `remote manifest`, `subapp mount`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-microfrontend-runtime-workflow.mjs`

### `session`

- 名称: Session lifecycle
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `medium`
- 路线轨道: `session`
- 协议文档: `references/session-lifecycle-playbook.md`
- 必需 signals: `session`, `bootstrap`, `token refresh`, `cookie`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-session-lifecycle-workflow.mjs`

### `source-map`

- 名称: Source map recovery
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `medium`
- 路线轨道: `source-map`
- 协议文档: `references/source-map-playbook.md`
- 必需 signals: `source map`, `sourceMappingURL`, `hidden source map`, `bundle`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-source-map-workflow.mjs`

### `storage`

- 名称: Storage analysis
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `medium`
- 路线轨道: `storage`
- 协议文档: `references/storage-playbook.md`
- 必需 signals: `cookie`, `localStorage`, `sessionStorage`, `indexedDB`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-storage-workflow.mjs`

### `webauthn-passkey`

- 名称: WebAuthn / passkey / challenge flow
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `webauthn-passkey`
- 协议文档: `references/webauthn-passkey-playbook.md`
- 必需 signals: `navigator.credentials`, `PublicKeyCredential`, `webauthn.create`, `webauthn.get`, `challenge`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-webauthn-passkey-workflow.mjs`

### `webrtc-datachannel`

- 名称: WebRTC / signaling / datachannel
- 成熟度: `closed-loop`
- 维护方: `web-reverse-core`
- 风险等级: `high`
- 路线轨道: `webrtc-datachannel`
- 协议文档: `references/webrtc-datachannel-playbook.md`
- 必需 signals: `RTCPeerConnection`, `createOffer`, `setLocalDescription`, `ICE`, `RTCDataChannel`
- 必需检查: `check:topic-manifests`, `check:capability-coverage`
- caseFiles: `web-webrtc-datachannel-workflow.mjs`
