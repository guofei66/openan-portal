<!--
PR 合入门禁 / Merge gate: CI 必须三项全绿（lint / test / build）才会被合入。
All three CI jobs (lint / test / build) must pass before merge.
-->

## 变更说明 / What

<!-- 中文：本 PR 做了什么、为什么。
English: What this PR does and why. -->

## 变更类型 / Type of change

- [ ] 新插件 / New plugin (`plugins/<id>/`)
- [ ] 插件变更 / Plugin change
- [ ] 框架/壳层 / Portal shell or SDK (`portal/`, `packages/`)
- [ ] 预构建产物 / Prebuilt bundle artifact (`portal/public/plugins/`)
- [ ] 构建/CI/文档 / Build, CI or docs
- [ ] 其他 / Other

## 测试 / Testing

- [ ] 新增或变更的代码已配套单元测试；**插件改动必须包含 `plugins/<id>/tests/` 契约测试**
  Unit tests cover the new/changed code; **plugin changes MUST include the `plugins/<id>/tests/` contract tests**
- [ ] `npm run lint` 通过 / passes
- [ ] `npm test` 通过 / passes
- [ ] 涉及运行时代码时 `npm run build` 通过 / `npm run build` passes when runtime code changed

## 治理清单 / Governance checklist

- [ ] 新增插件已接入自动发现（`plugins/<id>/plugin.manifest.js`）或 `portal/src/plugins.config.js`，`plugins/plugin-overrides.json` 语义未破坏
  New plugins are wired via auto-discovery or `plugins.config.js` without breaking `plugin-overrides.json` semantics
- [ ] 若改动了 `portal/public/plugins/` 下的预构建产物，已在本地跑过 bundle 契约测试（`npx vitest run tests/bundle-artifacts.test.js`，CI 中该目录不存在会自动跳过）
  If prebuilt bundle artifacts changed, the bundle contract test was run locally (it self-skips in CI where the directory is absent)
- [ ] commit 均带 DCO 签署（`git commit -s`）
  All commits are DCO-signed
