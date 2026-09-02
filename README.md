# mcwiki-search

DeepSeek Harness（DSH）工具插件：查询 **Minecraft Wiki**（MediaWiki API，中文 / 英文），并把搜索结果与页面全文**完整转换为 AI 可直接阅读的干净文本**。

> 核心承诺：模型看到的永远是清洗后的结果 —— 模板、引用、图片、跨语言链接等噪声在插件内部全部处理完毕，绝不让原始 wikitext / HTML 进入模型上下文。

## 功能

注册 3 个模型工具：

| 工具 | 作用 | 返回 |
|---|---|---|
| `mcwiki_search` | 全文搜索 | 清洗后的标题 / 摘要（命中词加粗）/ URL / 更新时间 |
| `mcwiki_get_page` | 抓取页面 | `section=intro` 纯文本引言（默认）；`section=full` 全文 → Markdown / 纯文本 / wikitext。**默认完整输出、不截断**；可传 `maxChars`（0=不截断，正数=上限）按需设限 |
| `mcwiki_random` | 随机条目 | 条目标题 + 引言纯文本（完整、不截断） |

配套「设置 → Minecraft Wiki 搜索」页面：查看数据源状态、搜索测试、页面转换测试（直接看转换后的文本）。

> **完整性承诺**：搜索摘要、引言、全文（含表格）默认**完整输出、绝不截断** —— 所有信息与细节都保留给 AI。只有显式传 `maxChars`（正整数）或部署配置设限时才会截断，且输出末尾会明确标注。设置页中的转换测试为 UI 预览（最多 6000 字符），与模型工具无关。

## 数据转换管线

```
MediaWiki API JSON
  └─ cleanSearchSnippet()   搜索摘要：searchmatch 高亮 → **加粗**，实体解码，
  │                         空白折叠，修复中文 bigram 拆词（「苦力 怕」→「苦力怕」）
  ├─ extracts plaintext     引言：MediaWiki 官方纯文本输出 + 收尾清洗
  └─ wikitextToMarkdown()   全文：
       ├─ {{模板}} 整块处理 —— 信息框/历史/音效/导航等噪声整块丢弃；
       │                     {{tr|简体|…}} 取简体、*Link/*Sprite 取条目名、
       │                     {{droptable|dropline}} 保留掉落表、{{only/in/el}} 渲染版本、
       │                     {{quote}} 保留引言、{{cd/cmd}} 保留代码
       ├─ <ref>/<gallery>/<syntaxhighlight> 等标签块丢弃
       ├─ [[File:…]]/[[Category:…]]/[[w:…]]/跨语言链接 丢弃；[[目标|显示名]] → 显示名
       ├─ == 标题 == → ## 标题；'''粗体''' → **粗体**；''斜体'' → *斜体*
       ├─ 列表 * # : ; 归一化；{|…|} 表格扁平化为 Markdown 表格（完整保留）
       └─ 输出完整不截断（默认）；传 maxChars 正整数才设上限并标注
```

## 安装（推荐：GitHub）

```sh
dsh plugin --profile web add github:Yinxe/dsh-mcwiki-search
```

`dsh plugin` 把参数转发给 profile 目录里的 pnpm，装完自动把插件写进 profile 的 `dsh.profile.bundles` 挂载列表 —— **无需手动改任何配置文件**。

重启生效：

```sh
dsh web
```

**验证**：打开 web 页面 → 设置 → Minecraft Wiki 搜索 出现插件卡片；或直接对模型说「用 mcwiki_search 查一下苦力怕」。

## 更新

```sh
dsh plugin --profile web update "@dshp-inx/mcwiki-search" --latest
dsh web
```

`update --latest` 会让 pnpm 重新解析 GitHub 仓库的最新 commit 并更新 lockfile；重启后生效。

## 安装（备选：clone 源码 + 本地 link）

适合想改源码、或 GitHub 不可达的场景。link 安装的源码改动**即时生效**（client 半刷新页面即可，host 半需重启 `dsh web`）：

```sh
git clone git@github.com:Yinxe/dsh-mcwiki-search.git ~/.dsh/plugins/mcwiki-search
dsh plugin --profile web add "@dshp-inx/mcwiki-search@link:~/.dsh/plugins/mcwiki-search
# 若 pnpm 不展开 ~，改用绝对路径：
# dsh plugin --profile web add "@dshp-inx/mcwiki-search@link:/home/<you>/.dsh/plugins/mcwiki-search
dsh web
```

> ⚠️ **不要直接编辑 `node_modules/@dshp-inx/mcwiki-search/` 里的文件**：pnpm 的安装文件与内容寻址 store 硬链接，直接覆盖会连带改坏 store。改源码请改 link 指向的源码目录。

link 方式的更新就是 `git pull`（源码目录）+ 刷新页面/重启。

## 验证（不依赖 DSH 运行时）

```sh
node lib/self-test.js                 # 中文搜索「钻石」+ 引言 + 全文转 Markdown + 随机
node lib/self-test.js 苦力怕          # 指定查询词
node lib/self-test.js "Ancient City" en   # 英文 wiki
node lib/self-test.js --no-page       # 仅搜索
```

每个用例输出均展示转换后的 AI 可读文本。

**集成测试**（真实 cordis 表面 + DSH schema 校验 + 真实执行）：

```sh
# 方式 A：在任意 DSH profile 目录内运行（dsh-tools 按 profile 解析）
cd ~/.dsh/profiles/web && node ../../plugins/mcwiki-search/test/integration.mjs

# 方式 B：任意位置，显式指定 dsh-tools 入口
DSH_TOOLS_ENTRY=/path/to/node_modules/@deepseek-ai/dsh-tools/lib/index.js \
  node test/integration.mjs
```

## 卸载

```sh
dsh plugin --profile web remove "@dshp-inx/mcwiki-search"
dsh web
```

`remove` 会自动从 `dsh.profile.bundles` 撤下挂载。

## 配置

patch 层可覆盖（`config:` 字段），默认值即开即用：

```yaml
- id: mcwiki-search
  name: mcwiki-search
  config:
    apiBase: https://zh.minecraft.wiki/api.php   # 或 en: https://minecraft.wiki/api.php
    timeoutMs: 15000
    maxChars: 0          # 全文输出上限：0 = 不截断（默认，完整输出）
    introMaxChars: 0     # 引言上限：0 = 不截断（默认）
    searchMaxResults: 8  # 搜索默认条数
```

## 免责声明

- 数据来源：[zh.minecraft.wiki](https://zh.minecraft.wiki) / [minecraft.wiki](https://minecraft.wiki)，内容按 CC BY-NC-SA 3.0 授权，引用请注明出处；
- 本插件与 Mojang Studios / Microsoft 无任何隶属关系；
- 使用公开 MediaWiki API，无密钥、无配额申请。
