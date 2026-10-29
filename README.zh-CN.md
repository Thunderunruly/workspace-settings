# DSH 工作区设置

[![npm version](https://img.shields.io/npm/v/dsh-workspace-settings?color=cb3837&logo=npm)](https://www.npmjs.com/package/dsh-workspace-settings)
[![npm downloads](https://img.shields.io/npm/dm/dsh-workspace-settings)](https://www.npmjs.com/package/dsh-workspace-settings)
[![GitHub stars](https://img.shields.io/github/stars/Thunderunruly/workspace-settings?style=social)](https://github.com/Thunderunruly/workspace-settings)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.3-4a6cff)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.md) | **简体中文**

**DeepSeek Harness（DSH）** 插件：按工作区保存会话默认值。每个工作区可以有自己的 Agent
模式、权限预设、模型、推理强度，以及 Chat 的工作步骤展示级别与收起时机。在该工作区新建
会话时直接使用这些值，不再只有一份全局设置；会话内手动修改仍然优先。

界面基于 DSH 官方 UI 原语：工作区设置对话框使用宿主的 `Modal` / `Menu` / `Button` /
`Input`，行结构与内置「通用设置」一致。修改立即生效，没有保存 / 取消步骤。

## 目录

- [功能](#功能)
- [环境要求](#环境要求)
- [安装](#安装)
- [使用](#使用)
- [配置](#配置)
- [工作步骤展示与收起时机](#工作步骤展示与收起时机)
- [实现原理](#实现原理)
- [隐私](#隐私)
- [开发](#开发)
- [项目结构](#项目结构)
- [已知限制](#已知限制)
- [许可证](#许可证)

## 功能

- **工作区菜单入口**：工作区行 `...` 菜单新增 **工作区设置**，位于重命名 / 删除工作区
  上方；右键工作区行也会打开同一个官方菜单。
- **设置页**：设置 → **工作区设置** 列出全部工作区及其覆盖项摘要，并提供编辑按钮。
- **六项按工作区保存的默认值**：

  | 设置 | 可选值 |
  | --- | --- |
  | 模式 | 任意已安装 Agent 预设，或跟随全局 |
  | 审查与权限 | 任意已配置权限预设，或跟随全局 |
  | 模型 | 任意可路由模型，或跟随全局 |
  | 强度 | 所选模型的推理强度 |
  | 工作步骤展示 | 简洁 / 标准 / 详细 / 完全展开，或跟随全局 |
  | 工作步骤收起时机 | 回答结束后 / 下次有新消息时，或跟随全局 |

- **自动继承**：工作区内新建或复用的空白会话会收到保存的模式、权限预设与模型；会话内的
  显式修改仍然优先——插件只会替换“看起来仍来自全局默认或上次工作区设置”的值。
- **官方文案**：内置模式与权限显示为 **标准模式 / PTC 模式 / 极简模式 / 创造模式**、
  **仅可查看 / 工作区内修改 / 完全权限 / 自动审查**，不会显示 `standard`、
  `workspace-write` 这类机器键名。
- **即时保存**：每个下拉选择后立即写入，与通用设置一致；关闭对话框即保留已选项，仅失败时
  给出提示。
- **原生外观**：菜单、弹窗、选择器与设置行都复用宿主原语和主题 token，浅色 / 深色切换与
  后续主题变化自动跟随。
- **本地、安静**：设置保存在 DSH home 下的一个 JSON 文件；无遥测、无网络请求。

## 环境要求

- **DeepSeek Harness（DSH）**，需支持 Web UI 与插件；开发与验证基于 DSH `0.2.1-rc.3`
  桌面端 profile。
- 插件包为 ESM（`"type": "module"`），运行时从宿主客户端加载 `react` 与 UI 原语，不打包
  额外依赖。
- 需要 Chromium 内核的 DSH Web UI；纯 CLI 组合中不会渲染界面。
- `node` 仅离线检查需要；普通使用不需要安装 Node。

## 安装

### 从 npm 安装（推荐）

```sh
dsh plugin --profile <profile> add dsh-workspace-settings
```

安装指定版本或升级：

```sh
dsh plugin --profile <profile> add dsh-workspace-settings@1.0.1
dsh plugin --profile <profile> add dsh-workspace-settings@latest
```

安装后重载一次 DSH 窗口，让客户端 bundle 进入启动图；此后客户端改动支持热加载。

### 从本地目录安装（开发）

```sh
git clone https://github.com/Thunderunruly/workspace-settings.git
```

然后安装到 profile：

- **桌面端**：打开 **设置 → 插件 → 添加插件 → 本地 bundle**，选择克隆下来的目录。桌面端
  profile 由 Electron 应用管理，请通过应用内插件管理器安装。
- **CLI profile**：把目录作为 linked 依赖加入 profile，由 bundle patch 自动插入插件行：

  ```sh
  dsh plugin --profile web add file:/本目录绝对路径
  ```

### 验证安装

1. 工作区行 `...` 菜单中出现 **工作区设置**，位于重命名 / 删除工作区上方；
2. 侧边栏「设置」中出现 **工作区设置** 页面；
3. 打开后每个工作区一行，右侧有「编辑」按钮和当前覆盖摘要。

### 升级 / 卸载

- npm 升级：执行上面的 `@latest` 命令并重载窗口。
- 本地目录升级：在克隆目录 `git pull`，然后通过插件管理器重新安装 / 刷新并重载窗口。
- 卸载：在插件管理器中移除 bundle（或从 profile 删除依赖）。已保存的工作区配置位于
  `$DSH_HOME/storages/workspace-settings/settings.json`，删除该文件才会清空。

## 使用

### 打开设置

1. 侧边栏工作区行悬停后点 `...`，选择 **工作区设置**；或右键工作区行，在同一官方菜单中
   选择。
2. 也可以走 **设置 → 工作区设置**，点击任意工作区的 **编辑**。

### 保存后的行为

没有保存按钮，每次修改立即持久化，对话框只报告失败；用 `×`、Escape 或点击遮罩关闭都会
保留已生效的修改。

在该工作区新建会话（或复用空白会话）时，Host 会应用保存的默认值：

- **模式**：通过官方 Agent 预设切换接口应用，仅在会话仍空白时执行。
- **权限**：通过官方权限预设接口应用，写入标准 Session 事件。
- **模型 + 强度**：作为首个模型请求的覆盖；从第二次模型请求开始，会话自己的模型选择器
  重新拥有最终决定权。
- **工作步骤展示 / 收起时机**：当该工作区的会话处于激活状态时，切换官方 Chat 展示偏好；
  离开后恢复全局值。

已经开始对话的会话不会被改写；子代理会话与分叉会话会跳过；空白会话中用户显式选过的值会
通过“当前值 vs 全局默认 vs 上次工作区应用值”的对比被保留。

## 配置

插件没有 profile 配置字段，全部数据在插件自己的存储里。

| 内容 | 位置 |
| --- | --- |
| 工作区默认值 | `$DSH_HOME/storages/workspace-settings/settings.json` |
| 工作步骤展示 / 收起时机的全局基线 | 浏览器 `localStorage` 键 `dsh-workspace-settings:chat-baseline:v1` |
| 每个会话的“上次应用”缓存 | 同一 `settings.json` 的 `sessions` 段（派生缓存，可安全丢失） |

工作区以规范化路径为键，因此重命名工作区不会丢失设置。把某一项改回 **跟随全局默认** 会
从存储中移除对应覆盖；所有项都跟随全局时，该工作区记录会被删除。

## 工作步骤展示与收起时机

DSH 0.2.1 把 **工作步骤展示** 与 **工作步骤收起时机** 存为全局 Chat 偏好（`ui-chat`），
而不是会话级设置。插件把工作区值当作“展示期覆盖”：

1. 当前激活会话属于带该值的工作区时，插件把官方 Chat 偏好切换到工作区值；
2. 切到其他工作区（或离开该工作区会话）时，恢复你原本的全局值（启动时捕获为基线）；
3. 在通用设置中修改全局值时，会更新该基线；下次该工作区会话激活时会重新应用工作区值。

工作区覆盖生效期间，通用设置里这两行会显示工作区值，这是预期行为。展示偏好不会写入任何
Session 事件。

## 实现原理

一个 bundle 包含宿主端与客户端两半：

- **`index.js`** — 宿主端。拥有 JSON 存储，暴露两个需认证的 POST 路由
  （`/api/workspace-settings/catalog`、`/api/workspace-settings/save`），并监听
  `agent/created`，把工作区默认值应用到空白普通会话。它使用公开的
  `workspaceRegistry`、`agentPresets`、`permissionPresets`、`sessionController` 与
  `agentDefaultModel` 服务，以及 Session 投影判断空白 / 预设 / 待应用模型状态。
- **`client.js`** — 客户端。注册 `settings.section` 页面与 `shell.overlay` 浮层；浮层识别
  文档化的 `data-row-key="workspace:<id>"` 行，接管该行菜单按钮（与右键），用官方 `Menu`
  渲染菜单；重命名 / 删除调用公开的 `ctx.workspaces` 服务。设置对话框使用官方
  `Modal` / `Button` / `Input`，行与选择器几何与内置权限设置行一致。另有一个轻量
  watcher 跟随当前激活会话应用 Chat 展示偏好。
- **`cordis.patch.yml`** — 把插件行插入 profile 的 bundle patch。

模型覆盖以 Agent 作用域的 `system-prompt/assemble` 与 `agent/request` 监听器实现，只在首个
请求生效，不会修改全局默认模型；会话记录自己的请求头后即停止覆盖。

## 隐私

- 插件不发起网络请求，全部数据保存在本地文件。
- 不收集凭据、会话内容或个人数据。
- 插件不包含遥测。
- Chat 偏好切换只写通用设置本来就会写的同一份 `ui-chat` profile 值，离开时恢复全局基线。

## 开发

离线检查，无需浏览器：

```powershell
node --check index.js
node --check client.js
node --test test/host.check.mjs
```

项目没有构建步骤：`client.js` 以单文件模块 bundle 直接加载，React 与 UI 原语来自运行中的
宿主模块表。测试用小型 fake 替代 Cordis 服务，覆盖校验、存储、catalog/save 路由、预设 /
权限继承与首请求模型覆盖。

本地链接安装时，直接修改本目录文件并重载 DSH 窗口即可；Host 侧改动需要重新启用插件行，
纯客户端改动支持热加载。

## 项目结构

```
client.js           # 客户端：设置页、工作区菜单浮层、Chat 偏好 watcher
index.js            # 宿主端：JSON 存储、Web 路由、会话继承
cordis.patch.yml    # 插入插件行的 bundle patch
package.json        # bundle 清单（dsh.bundle / dsh.client）
locale/             # 插件标题/描述词典（中文、英文）
icon.svg            # 插件图标
test/host.check.mjs # 离线宿主检查
wiki/               # GitHub Wiki 页面源文件（DSH 不会加载）
LICENSE             # MIT
```

## 已知限制

- DSH 0.2.1 没有工作区菜单扩展槽位。插件因此接管工作区行的 `...` 菜单，并用**官方
  `Menu` 原语**重新渲染。未来 DSH 若提供原生槽位，应迁移过去。
- 模型 / 强度默认值只作用于新会话的首个模型请求，之后会话内模型选择器完全优先。
- 工作步骤展示 / 收起时机没有 per-session API，只能通过“激活工作区会话时切换官方全局
  偏好”的方式实现（见上文）。
- 其他通用设置（外观、语言、链接打开方式、性能与用量、隐私选项）仍然全局。
- 这是本地 / 实验性插件，不是 DeepSeek 官方产品。

## 许可证

[MIT](LICENSE) © Thunderunruly
