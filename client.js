/* mcwiki-search client half — hand-authored __ModuleLoader__ bundle.
 * 设置页：查看数据源状态、运行搜索/页面抓取测试，直接看到「转换后的 AI 可读文本」。
 *
 * UI 规范（见 ~/.dsh/plugins/README.md「设置 UI 规范」）：
 *  - 控件全部 require 官方 @deepseek-ai/dsh-client-ui-primitives（浏览器种子模块）；
 *  - 布局用官方设置行（padding:16px 0 + .5px 底分割线 + 左标题/描述右控件）；
 *  - 输入 = 官方 Input 规格；按钮 = P.Button；颜色只用 --dsw-alias-* token。
 */
window.__ModuleLoader__.load({
  id: '@dshp-inx/mcwiki-search',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const P = require('@deepseek-ai/dsh-client-ui-primitives')

    const CSS = `
.mw-page{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;display:flex}
.mw-section{flex-direction:column;width:100%;display:flex}
.mw-sectionHead{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px;padding:14px 0 2px}
.mw-row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}
.mw-rowWrap{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:flex-start;gap:8px;padding:16px 0;display:flex;flex-direction:column}
.mw-section .mw-row:last-child,.mw-section .mw-rowWrap:last-child,.mw-section .mw-bar:last-child{border-bottom:none}
.mw-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}
.mw-control{align-items:center;gap:8px;display:inline-flex;flex:none}
.mw-unit{color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px;flex:none}
.mw-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.mw-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}
.mw-intro{color:var(--dsw-alias-label-tertiary);margin:0 0 4px;font-size:14px;line-height:22px}
.mw-mono{font-family:var(--ds-font-family-code)}
.mw-results{flex-direction:column;gap:8px;display:flex;padding:8px 0}
.mw-inputWrap{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);width:100%}
.mw-inputWrap:focus-within{border-color:var(--dsw-alias-brand-primary)}
.mw-input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);font-family:inherit}
.mw-input::placeholder{color:var(--dsw-alias-label-dimmed)}
.mw-input:disabled{opacity:.5}
.mw-badge{white-space:nowrap;align-items:center;height:20px;border-radius:10px;padding:0 8px;font-size:11px;font-weight:500;line-height:20px;display:inline-flex}
.mw-badge-ok{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}
.mw-badge-muted{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-caption)}
.mw-notice{margin:0;font-size:12px;line-height:18px}
.mw-notice-err{color:var(--dsw-alias-state-error-primary)}
.mw-notice-ok{color:var(--dsw-alias-state-success-primary)}
.mw-hint{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:0;line-height:18px}
.mw-bar{align-items:center;gap:8px;display:flex;flex-wrap:wrap;padding:12px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.mw-barEnd{align-items:center;gap:8px;display:flex;flex-wrap:wrap;padding:12px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);justify-content:flex-end}
.mw-loading{align-items:center;gap:8px;display:flex}
.mw-loadingText{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.mw-result-item{border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;flex-direction:column;gap:4px;padding:10px 12px;display:flex}
.mw-result-item a{color:var(--dsw-alias-state-business-primary);text-decoration:none;font-weight:500}
.mw-result-item a:hover{text-decoration:underline}
.mw-result-snippet{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:4px}
.mw-result-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:4px;word-break:break-all}
.mw-codeblock{margin-top:8px}
.mw-codeblock pre{max-height:320px;overflow:auto}
`

    function Badge(props) {
      return React.createElement('span', { className: 'mw-badge mw-badge-' + props.kind }, props.text)
    }

    function Row(props) {
      return React.createElement('div', { className: 'mw-row' },
        React.createElement('div', { className: 'mw-rowText' },
          React.createElement('div', { className: 'mw-title' }, props.label),
          props.desc ? React.createElement('div', { className: 'mw-desc' }, props.desc) : null),
        props.children)
    }

    function createSection(bridge) {
      return function McWikiSettingsSection() {
        const [info, setInfo] = React.useState(null)
        const [cfg, setCfg] = React.useState(null)
        const [cfgBusy, setCfgBusy] = React.useState(false)
        const [stateErr, setStateErr] = React.useState(null)
        const [notice, setNotice] = React.useState(null)
        const [busy, setBusy] = React.useState(null)
        const [query, setQuery] = React.useState('')
        const [result, setResult] = React.useState(null)
        const [title, setTitle] = React.useState('')
        const [pageResult, setPageResult] = React.useState(null)

        const load = React.useCallback(() => {
          bridge.getState().then((value) => {
            if (value && value.ok) { setInfo(value); setCfg((value && value.config) || null); setStateErr(null) }
            else setStateErr((value && value.error) || '无法读取插件状态')
          }).catch((error) => setStateErr(String((error && error.message) || error)))
        }, [])
        React.useEffect(() => { load() }, [load])

        const saveCfg = () => {
          if (cfg === null) return
          setCfgBusy(true); setNotice(null)
          bridge.saveConfig(cfg).then((value) => {
            setCfgBusy(false)
            if (value && value.ok) {
              setCfg(value.config)
              setNotice({ kind: 'ok', text: '配置已保存到 settings.yaml（dshp-inx-mcwiki-search），即时生效。' })
              load()
            } else setNotice({ kind: 'err', text: (value && value.error) || '保存失败' })
          }).catch((error) => {
            setCfgBusy(false)
            setNotice({ kind: 'err', text: String((error && error.message) || error) })
          })
        }

        const runSearch = () => {
          const q = query.trim()
          if (q.length === 0) { setNotice({ kind: 'err', text: '先输入一个测试查询。' }); return }
          setBusy('search'); setNotice(null); setResult(null)
          bridge.runTest(q, 'search').then((value) => {
            setBusy(null)
            setResult(value || { ok: false, error: '无响应' })
          }).catch((error) => {
            setBusy(null)
            setResult({ ok: false, error: String((error && error.message) || error) })
          })
        }

        const runPage = () => {
          const t = title.trim()
          if (t.length === 0) { setNotice({ kind: 'err', text: '先输入一个页面标题。' }); return }
          setBusy('page'); setNotice(null); setPageResult(null)
          bridge.runTest(t, 'page').then((value) => {
            setBusy(null)
            setPageResult(value || { ok: false, error: '无响应' })
          }).catch((error) => {
            setBusy(null)
            setPageResult({ ok: false, error: String((error && error.message) || error) })
          })
        }

        const children = []
        children.push(React.createElement('p', { className: 'mw-intro' },
          '直接从 Minecraft Wiki（MediaWiki API）查询，并把搜索结果 / 页面全文完整转换为 AI 可直接阅读的干净文本（去模板、去引用、wikitext→Markdown）。模型工具默认完整输出、不截断，所有信息与细节都会保留。可用工具：mcwiki_search、mcwiki_get_page、mcwiki_random。'))

        if (stateErr) children.push(React.createElement('p', { className: 'mw-notice mw-notice-err' }, '状态读取失败：' + stateErr))
        if (notice) children.push(React.createElement('p', { className: 'mw-notice mw-notice-' + notice.kind }, notice.text))

        /* ── 数据源状态（官方行） ── */
        const langBadge = info === null
          ? React.createElement(Badge, { kind: 'muted', text: '读取中…' })
          : React.createElement(Badge, { kind: 'ok', text: info.lang === 'en' ? '英文 Minecraft Wiki' : '中文 Minecraft Wiki（默认）' })
        children.push(React.createElement('div', { className: 'mw-section' },
          React.createElement('div', { className: 'mw-sectionHead' }, '数据源'),
          React.createElement(Row, { label: '数据源', desc: '搜索与页面抓取的目标站点。' }, langBadge),
          React.createElement(Row, { label: '密钥', desc: '无需注册，公开接口直接调用。' }, React.createElement(Badge, { kind: 'ok', text: '免费公开 API' })),
          React.createElement(Row, { label: '模型工具', desc: '注册给模型的三个查询工具。' },
            React.createElement('span', { className: 'mw-hint' }, ((info && info.tools) || ['mcwiki_search', 'mcwiki_get_page', 'mcwiki_random']).join('、')))))

        /* ── 配置（官方行 + Input）── API 端点是长 URL：整行输入（rowWrap，官方追加提示词行同款） */
        const apiBaseInput = React.createElement('div', { className: 'mw-inputWrap' },
          React.createElement('input', {
            className: 'mw-input',
            disabled: cfgBusy || cfg === null,
            placeholder: 'https://zh.minecraft.wiki/api.php',
            value: cfg === null ? '' : (cfg.apiBase || ''),
            onChange: (event) => {
              const v = event.target.value
              setCfg((prev) => prev === null ? prev : { ...prev, apiBase: v })
            }
          }))
        /* 数字行：官方字号行同款 —— 右侧输入 + 单位后缀（"px" 位置），desc 随行 */
        const numInput = (key, unit) => React.createElement('span', { className: 'mw-control' },
          React.createElement('div', { className: 'mw-inputWrap', style: { width: 96 } },
            React.createElement('input', {
              className: 'mw-input',
              style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
              inputMode: 'numeric',
              disabled: cfgBusy || cfg === null,
              value: cfg === null ? '' : String(cfg[key]),
              onChange: (event) => {
                const v = event.target.value
                setCfg((prev) => prev === null ? prev : { ...prev, [key]: v === '' ? 0 : Number(v) })
              }
            })),
          unit ? React.createElement('span', { className: 'mw-unit' }, unit) : null)
        children.push(React.createElement('div', { className: 'mw-section' },
          React.createElement('div', { className: 'mw-sectionHead' }, '配置', ),
          React.createElement('p', { className: 'mw-hint', style: { margin: '2px 0 0' } }, '持久化到 settings.yaml（dshp-inx-mcwiki-search 命名空间），保存即时生效。'),
          React.createElement('div', { className: 'mw-rowWrap' },
            React.createElement('div', { className: 'mw-rowText' },
              React.createElement('div', { className: 'mw-title' }, 'API 端点'),
              React.createElement('div', { className: 'mw-desc' }, 'MediaWiki api.php 地址，改到镜像站时填对应 api.php。')),
            apiBaseInput),
          React.createElement(Row, { label: '请求超时', desc: '单次请求的等待上限，≥1000。' }, numInput('timeoutMs', 'ms')),
          React.createElement(Row, { label: '搜索默认条数', desc: 'mcwiki_search 每页返回的条目数，≥1。' }, numInput('searchMaxResults', '条')),
          React.createElement(Row, { label: '全文上限', desc: 'mcwiki_get_page full 输出的字符数；0 表示完整输出不截断。' }, numInput('maxChars', null)),
          React.createElement(Row, { label: '引言上限', desc: 'intro 输出的字符数；0 表示完整输出不截断。' }, numInput('introMaxChars', null)),
          React.createElement('div', { className: 'mw-barEnd' },
            React.createElement(P.Button, { variant: 'outline', size: 'sm', disabled: cfgBusy, onClick: load }, '重新读取'),
            React.createElement(P.Button, { variant: 'primary', size: 'sm', disabled: cfgBusy || cfg === null, onClick: saveCfg }, cfgBusy ? '保存中…' : '保存配置'))))

        /* ── 搜索测试 ── */
        const searchInput = React.createElement('div', { className: 'mw-inputWrap' },
          React.createElement(P.IconSearchOutline16, null),
          React.createElement('input', {
            className: 'mw-input',
            placeholder: '搜索，例如：钻石 / 苦力怕 / Ancient City',
            value: query,
            onChange: (event) => setQuery(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') runSearch() }
          }))
        children.push(React.createElement('div', { className: 'mw-section' },
          React.createElement('div', { className: 'mw-sectionHead' }, '搜索测试'),
          React.createElement('p', { className: 'mw-hint', style: { margin: '2px 0 0' } }, '直接看到「转换后的 AI 可读摘要」——模型拿到的就是这个格式。'),
          React.createElement('div', { className: 'mw-bar', style: { borderBottom: 'none' } },
            searchInput,
            React.createElement(P.Button, {
              variant: 'primary', size: 'sm', disabled: busy !== null, onClick: runSearch,
              icon: busy === 'search' ? React.createElement(P.IconLoadingOutline16) : undefined
            }, busy === 'search' ? '搜索中…' : '搜索测试'))))

        if (busy === 'search') children.push(React.createElement('div', { className: 'mw-loading' },
          React.createElement(P.IconLoadingOutline16, null),
          React.createElement('span', { className: 'mw-loadingText' }, '正在请求 MediaWiki API …')))
        if (result !== null) {
          if (result.ok) {
            const items = []
            for (const item of result.results || []) {
              items.push(React.createElement('div', { className: 'mw-result-item', key: item.url },
                React.createElement(P.Tooltip, { label: item.url, side: 'top' },
                  React.createElement('a', { href: item.url, target: '_blank', rel: 'noreferrer' }, item.title)),
                React.createElement('div', { className: 'mw-result-snippet' }, item.snippet),
                React.createElement('div', { className: 'mw-result-meta' }, item.url + (item.updated ? ' · 更新 ' + String(item.updated).slice(0, 10) : ''))))
            }
            children.push(React.createElement('div', { className: 'mw-section' },
              React.createElement('div', { className: 'mw-sectionHead' },
                '搜索成功 · 共 ' + result.totalHits + ' 条 · ' + result.takenMs + ' ms'),
              React.createElement('div', { className: 'mw-results' },
                items.length > 0 ? items : React.createElement('span', { className: 'mw-hint' }, '无结果'))))
          } else {
            children.push(React.createElement('p', { className: 'mw-notice mw-notice-err' },
              '测试失败' + (result.takenMs ? '（' + result.takenMs + ' ms）' : '') + '：' + result.error))
          }
        }

        /* ── 页面转换测试 ── */
        const pageInput = React.createElement('div', { className: 'mw-inputWrap' },
          React.createElement('input', {
            className: 'mw-input',
            placeholder: '页面标题，例如：苦力怕 / Diamond Ore',
            value: title,
            onChange: (event) => setTitle(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') runPage() }
          }))
        children.push(React.createElement('div', { className: 'mw-section' },
          React.createElement('div', { className: 'mw-sectionHead' }, '页面转换测试'),
          React.createElement('p', { className: 'mw-hint', style: { margin: '2px 0 0' } }, 'wikitext → Markdown 预览（最多 6000 字符）；模型工具输出为完整全文。'),
          React.createElement('div', { className: 'mw-bar', style: { borderBottom: 'none' } },
            pageInput,
            React.createElement(P.Button, {
              variant: 'primary', size: 'sm', disabled: busy !== null, onClick: runPage,
              icon: busy === 'page' ? React.createElement(P.IconLoadingOutline16) : undefined
            }, busy === 'page' ? '抓取中…' : '页面转换测试'))))

        if (busy === 'page') children.push(React.createElement('div', { className: 'mw-loading' },
          React.createElement(P.IconLoadingOutline16, null),
          React.createElement('span', { className: 'mw-loadingText' }, '正在抓取并转换页面 …')))
        if (pageResult !== null) {
          if (pageResult.ok && pageResult.page) {
            children.push(React.createElement('div', { className: 'mw-section' },
              React.createElement('div', { className: 'mw-sectionHead' },
                pageResult.page.title + '（' + pageResult.page.section + ' · ' + pageResult.page.format + '）'),
              React.createElement(P.CodeBlock, {
                code: pageResult.page.text,
                lang: 'markdown',
                copyLabel: '复制',
                copiedLabel: '已复制',
                className: 'mw-codeblock'
              }),
              React.createElement('div', { className: 'mw-hint', style: { marginTop: 6 } }, '来源：' + pageResult.page.url)))
          } else {
            children.push(React.createElement('p', { className: 'mw-notice mw-notice-err' },
              '页面抓取失败：' + ((pageResult && pageResult.error) || '未知错误')))
          }
        }

        return React.createElement('div', { className: 'mw-page' }, children)
      }
    }

    exports.inject = ['slots']
    exports.apply = function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      const bridge = {
        getState: async () => {
          const response = await fetch('/ext/dshp-inx-mcwiki-search/state', { cache: 'no-store' })
          return response.json()
        },
        saveConfig: async (patchValue) => {
          const response = await fetch('/ext/dshp-inx-mcwiki-search/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patchValue || {})
          })
          return response.json()
        },
        runTest: async (value, kind) => {
          const response = await fetch('/ext/dshp-inx-mcwiki-search/test', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(kind === 'page' ? { query: value, title: value, section: 'full' } : { query: value, section: 'intro' })
          })
          return response.json()
        }
      }

      const sectionStyle = document.createElement('style')
      sectionStyle.setAttribute('data-plugin-css', 'dshp-inx-mcwiki-search/settings.css')
      sectionStyle.textContent = CSS
      document.head.appendChild(sectionStyle)
      ctx.effect(() => () => sectionStyle.remove(), 'mcwiki-search: section styles')

      const Section = createSection(bridge)
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'dshp-inx-mcwiki-search', order: 26, label: 'Minecraft Wiki 搜索' },
        Section
      ))
    }

    return module.exports
  }
})
