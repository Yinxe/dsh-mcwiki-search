/* mcwiki-search client half — hand-authored __ModuleLoader__ bundle.
 * 设置页：查看数据源状态、运行搜索/页面抓取测试，直接看到「转换后的 AI 可读文本」。 */
window.__ModuleLoader__.load({
  id: '@dshp-inx/mcwiki-search',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    const CSS = `
.mw-page{font-size:13px;line-height:1.6;color:var(--dsw-alias-label-primary);max-width:680px}
.mw-title{font-size:15px;font-weight:600;margin:0 0 4px}
.mw-desc{color:var(--dsw-alias-label-secondary);margin:0 0 14px}
.mw-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:14px 16px;margin:0 0 14px}
.mw-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.mw-row:last-child{border-bottom:none}
.mw-label{color:var(--dsw-alias-label-secondary)}
.mw-badge{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:500;white-space:nowrap}
.mw-badge-ok{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);color:var(--dsw-alias-state-success-primary)}
.mw-badge-warn{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent);color:var(--dsw-alias-state-warn-primary)}
.mw-badge-muted{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.mw-input{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-primary);padding:7px 10px;font-size:13px;outline:none}
.mw-input:focus{border-color:var(--dsw-alias-brand-primary)}
.mw-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer}
.mw-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.mw-btn:disabled{opacity:.4;cursor:default}
.mw-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.mw-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.mw-notice{padding:8px 12px;border-radius:8px;margin:0 0 12px;font-size:12.5px}
.mw-notice-ok{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);color:var(--dsw-alias-state-success-primary)}
.mw-notice-err{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);color:var(--dsw-alias-state-error-primary)}
.mw-result-item{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px;margin-bottom:8px}
.mw-result-item a{color:var(--dsw-alias-state-business-primary);text-decoration:none;font-weight:500}
.mw-result-item a:hover{text-decoration:underline}
.mw-result-snippet{color:var(--dsw-alias-label-primary);margin-top:4px}
.mw-result-meta{color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:4px;word-break:break-all}
.mw-test-bar{display:flex;gap:8px;align-items:center}
.mw-hint{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:6px}
.mw-pre{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:12.5px;white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto}
`

    function Badge(props) {
      return React.createElement('span', { className: 'mw-badge mw-badge-' + props.kind }, props.text)
    }

    function Row(props) {
      return React.createElement('div', { className: 'mw-row' },
        React.createElement('span', { className: 'mw-label' }, props.label),
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
        children.push(React.createElement('h3', { className: 'mw-title' }, 'Minecraft Wiki 搜索（mcwiki-search）'))
        children.push(React.createElement('p', { className: 'mw-desc' },
          '直接从 Minecraft Wiki（MediaWiki API）查询，并把搜索结果 / 页面全文完整转换为 AI 可直接阅读的干净文本（去模板、去引用、wikitext→Markdown）。模型工具默认完整输出、不截断，所有信息与细节都会保留。可用工具：mcwiki_search、mcwiki_get_page、mcwiki_random。'))

        if (stateErr) children.push(React.createElement('div', { className: 'mw-notice mw-notice-err' }, '状态读取失败：' + stateErr))
        if (notice) children.push(React.createElement('div', { className: 'mw-notice mw-notice-' + notice.kind }, notice.text))

        const langBadge = info === null
          ? React.createElement(Badge, { kind: 'muted', text: '读取中…' })
          : React.createElement(Badge, { kind: 'ok', text: info.lang === 'en' ? '英文 Minecraft Wiki' : '中文 Minecraft Wiki（默认）' })

        const statusCard = React.createElement('div', { className: 'mw-card' },
          React.createElement(Row, { label: '数据源' }, langBadge),
          React.createElement(Row, { label: 'API 端点' }, React.createElement('span', { style: { wordBreak: 'break-all' } }, (info && info.apiBase) || '—')),
          React.createElement(Row, { label: '模型工具' }, React.createElement('span', null, ((info && info.tools) || ['mcwiki_search', 'mcwiki_get_page', 'mcwiki_random']).join('、'))),
          React.createElement(Row, { label: '无密钥' }, React.createElement(Badge, { kind: 'ok', text: '免费公开 API' })))
        children.push(statusCard)

        const numField = (label, key, hint) => React.createElement(Row, { label },
          React.createElement('input', {
            className: 'mw-input',
            style: { maxWidth: 140, textAlign: 'right' },
            inputMode: 'numeric',
            disabled: cfgBusy || cfg === null,
            value: cfg === null ? '' : String(cfg[key]),
            onChange: (event) => {
              const v = event.target.value
              setCfg((prev) => prev === null ? prev : { ...prev, [key]: v === '' ? 0 : Number(v) })
            },
            title: hint
          }))
        const configCard = React.createElement('div', { className: 'mw-card' },
          React.createElement('div', { style: { fontWeight: 600, marginBottom: 6 } }, '配置（settings.yaml · dshp-inx-mcwiki-search）'),
          React.createElement(Row, { label: 'API 端点' },
            React.createElement('input', {
              className: 'mw-input',
              disabled: cfgBusy || cfg === null,
              placeholder: 'https://zh.minecraft.wiki/api.php',
              value: cfg === null ? '' : (cfg.apiBase || ''),
              onChange: (event) => {
                const v = event.target.value
                setCfg((prev) => prev === null ? prev : { ...prev, apiBase: v })
              }
            })),
          numField('请求超时(ms)', 'timeoutMs', '≥1000'),
          numField('搜索默认条数', 'searchMaxResults', '≥1'),
          numField('全文上限(0=不截断)', 'maxChars', '≥0，0 表示完整输出'),
          numField('引言上限(0=不截断)', 'introMaxChars', '≥0，0 表示完整输出'),
          React.createElement('div', { style: { marginTop: 10, display: 'flex', gap: 8 } },
            React.createElement('button', { className: 'mw-btn mw-btn-primary', disabled: cfgBusy || cfg === null, onClick: saveCfg }, cfgBusy ? '保存中…' : '保存配置'),
            React.createElement('button', { className: 'mw-btn', disabled: cfgBusy, onClick: load }, '重新读取')))
        children.push(configCard)

        const testRow = React.createElement('div', { className: 'mw-test-bar' },
          React.createElement('input', {
            className: 'mw-input',
            placeholder: '搜索，例如：钻石 / 苦力怕 / Ancient City',
            value: query,
            onChange: (event) => setQuery(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') runSearch() }
          }),
          React.createElement('button', { className: 'mw-btn mw-btn-primary', disabled: busy !== null, onClick: runSearch }, busy === 'search' ? '搜索中…' : '搜索测试'))
        const testCard = React.createElement('div', { className: 'mw-card' },
          React.createElement('div', { style: { fontWeight: 600, marginBottom: 6 } }, '搜索测试（已转换的 AI 可读摘要）'),
          testRow)
        children.push(testCard)

        if (busy === 'search') children.push(React.createElement('div', { className: 'mw-hint' }, '正在请求 MediaWiki API …'))
        if (result !== null) {
          if (result.ok) {
            const items = []
            for (const item of result.results || []) {
              items.push(React.createElement('div', { className: 'mw-result-item', key: item.url },
                React.createElement('a', { href: item.url, target: '_blank', rel: 'noreferrer' }, item.title),
                React.createElement('div', { className: 'mw-result-snippet' }, item.snippet),
                React.createElement('div', { className: 'mw-result-meta' }, item.url + (item.updated ? ' · 更新 ' + String(item.updated).slice(0, 10) : ''))))
            }
            children.push(React.createElement('div', { className: 'mw-card' },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: 8 } },
                '搜索成功 · 共 ' + result.totalHits + ' 条 · ' + result.takenMs + ' ms'),
              items.length > 0 ? items : React.createElement('div', { className: 'mw-hint' }, '无结果')))
          } else {
            children.push(React.createElement('div', { className: 'mw-notice mw-notice-err' },
              '测试失败' + (result.takenMs ? '（' + result.takenMs + ' ms）' : '') + '：' + result.error))
          }
        }

        const pageRow = React.createElement('div', { className: 'mw-test-bar' },
          React.createElement('input', {
            className: 'mw-input',
            placeholder: '页面标题，例如：苦力怕 / Diamond Ore',
            value: title,
            onChange: (event) => setTitle(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') runPage() }
          }),
          React.createElement('button', { className: 'mw-btn mw-btn-primary', disabled: busy !== null, onClick: runPage }, busy === 'page' ? '抓取中…' : '页面转换测试'))
        const pageCard = React.createElement('div', { className: 'mw-card' },
          React.createElement('div', { style: { fontWeight: 600, marginBottom: 6 } }, '页面转换测试（wikitext → Markdown 预览，最多 6000 字符；模型工具输出为完整全文）'),
          pageRow)
        children.push(pageCard)

        if (busy === 'page') children.push(React.createElement('div', { className: 'mw-hint' }, '正在抓取并转换页面 …'))
        if (pageResult !== null) {
          if (pageResult.ok && pageResult.page) {
            children.push(React.createElement('div', { className: 'mw-card' },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: 8 } },
                pageResult.page.title + '（' + pageResult.page.section + ' · ' + pageResult.page.format + '）'),
              React.createElement('div', { className: 'mw-pre' }, pageResult.page.text),
              React.createElement('div', { className: 'mw-hint' }, '来源：' + pageResult.page.url)))
          } else {
            children.push(React.createElement('div', { className: 'mw-notice mw-notice-err' },
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