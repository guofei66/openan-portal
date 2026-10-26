# OpenAN Portal 测试指南 / Testing Guide

> 单元测试体系与合入门禁 —— 保证代码修改和合入的质量治理
> Unit test suite and merge quality gates — governance for code changes and merges.

## 快速开始 / Quick Start

```bash
npm install            # 安装全部 workspace 依赖
npm test               # 全量单元测试（CI 同款命令）
npm run test:watch     # 监听模式，开发时使用
npm run test:coverage  # 覆盖率报告（输出到 coverage/）
npm run lint           # ESLint
npm run build          # 生产构建
```

## 合入门禁 / Merge Gates

CI（[.github/workflows/ci.yml](../.github/workflows/ci.yml)）对每个 PR 和 main 分支推送执行三项检查，**全部通过才允许合入**：

| 门禁 | 命令 | 内容 |
|------|------|------|
| Lint | `npm run lint` | 全仓库 ESLint（0 error；warning 不阻塞） |
| Test | `npm run test:coverage` | 单元测试 + 契约测试 + 覆盖率阈值（防倒退） |
| Build | `npm run build` | Portal 生产构建 |

**覆盖率阈值（防倒退 ratchet）**：全局下限设在当前真实覆盖率的略下方
（语句 38% / 分支 27% / 函数 33% / 行 38%），普通重构可过；删测试或
合入大量无测试模块会击穿下限而失败。插件契约核心 `packages/portal-sdk`
单独保持高标准（语句/分支/行 ≥90%）。数值写在 `vitest.config.js` 的
`coverage.thresholds`，随覆盖率提升逐步上调，只升不降。

提 PR 时请按模板勾选测试清单（见 `.github/pull_request_template.md`）。

## 测试布局 / Test Layout

测试与 workspace 结构一一对应：

```
packages/portal-sdk/tests/    # SDK 契约：validateManifest / loadEnabledPlugins /
                              # PortalContext / MockPortal
portal/tests/                 # 壳层：service/api、Auth、Theme、i18n、Header、Login、
                              # PluginManager、ErrorBoundary、PortalApp 冒烟、
                              # bundle-loader / remote-loader
plugins/<id>/tests/           # 每个源码插件的契约测试（manifest/i18n/路由/渲染冒烟）
tests/                        # 跨域检查：插件自动发现、plugins.config 一致性、
                              # 预构建 bundle 产物契约
tests/setup.js                # 全局 setup（jest-dom、cleanup、全局状态重置、jsdom polyfill）
tests/helpers/                # 共享测试工具
```

基础设施单源配置在根目录 `vitest.config.js`：jsdom 环境、`@`/`@openan/portal-sdk`
别名与 `portal/vite.config.js` 保持一致，并提供 `virtual:openan-plugins`
虚拟模块的测试孪生实现（与 Vite 插件同规则扫描 `plugins/` 并遵守
`plugin-overrides.json`）。

## 插件契约测试 / Plugin Contract Tests

**插件是本仓库治理的重点。** 每个插件（源码或预构建产物）都必须满足 Portal
插件契约，契约由测试固化：

- 源码插件（`plugins/<id>/plugin.manifest.js`）：
  - 通过 SDK `validateManifest` 校验（id/name/version/routes 形状）
  - `manifest.id` 与文件夹名一致
  - menu ↔ routes 一致（menu.route 有对应 route；route.menuId 存在；order 为数字）
  - i18n 命名空间等于插件 id；每个 menu labelKey 使用 `ns:` 前缀且在**每个**
    locale 文件中可解析
  - 路由懒加载组件可解析并可在 MockPortal 环境下渲染
- 预构建产物（`portal/public/plugins/<id>/`，gitignored，仅本地存在）：
  - `plugin.manifest.json` 形状合法、id 与目录名一致
  - `entry`/`css` 文件存在
  - UMD bundle 含全局赋值标记 `__OPENAN_PLUGIN__<id 中划线转下划线>`
  - 与 `plugins.config.js` 的 bundle 条目一一对应（无孤儿产物、无缺失条目）

新增插件时，复制任一现有插件的 `tests/contract.test.jsx` 改路径即可接入治理：

```js
import manifest from '../plugin.manifest.js';
import { verifySourcePluginContract } from '../../../tests/helpers/plugin-contract-utils.js';

verifySourcePluginContract({ manifest, expectedId: 'my-plugin' });
```

## 编写规范 / Conventions

1. 显式导入 `import { describe, it, expect, vi } from 'vitest'`（未开 globals）。
2. 优先使用共享工具（`tests/helpers/portal-test-utils.jsx`）：
   `createMockApi()`、`createMockPortalValue()`、`renderWithPortalContext()`、
   `renderWithShellProviders()`。
3. 期望组件渲染抛错的测试用 `renderToString`（SSR 路径），避免 jsdom
   "Uncaught" 噪音。
4. 不修改产品源码以迁就测试；mock 通过 `vi.mock`/`vi.spyOn` 完成。
5. 每个测试文件头部保留 Apache-2.0 版权注释。
6. 模块级单例（i18n、bundle-loader 的已加载集合）注意用唯一
   namespace/`vi.resetModules()` 隔离。

## 已知边界 / Known Boundaries

- `portal/public/plugins/**` 不入库，bundle 产物契约测试在 CI 中自动跳过
  （`describe.skipIf`），在本地合入前验证时生效。
- `remote-loader` 的真实网络加载不做联调，仅验证端口映射与失败语义。
- 端到端部署验证由部署脚本自检（`scripts/` 与 `deploy-*.sh`）覆盖，不属于 UT 范畴。
