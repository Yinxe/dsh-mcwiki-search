/**
 * @dshp-inx/mcwiki-search —— DSH Bundle 插件 Host 半（cordis 插件）。
 *
 * 挂载：~/.dsh/profiles/<profile>/cordis.patch.yml（自动通过 bundle patch）
 *
 * 提供三个模型工具（数据全部经 convert.js 清洗后输出，模型只看到干净文本）：
 *   - mcwiki_search      —— 全文搜索，返回清洗后的结果列表（标题/摘要/URL/更新时间）
 *   - mcwiki_get_page    —— 抓取页面：intro（extracts 纯文本）或 full（wikitext→Markdown/纯文本）
 *   - mcwiki_random      —— 随机条目 + 引言纯文本
 *
 * 以及三个同源 JSON 路由（设置页状态 / 配置持久化 / 连接测试）：
 *   GET  /ext/dshp-inx-mcwiki-search/state
 *   POST /ext/dshp-inx-mcwiki-search/config  { apiBase?, timeoutMs?, maxChars?, introMaxChars?, searchMaxResults? }
 *   POST /ext/dshp-inx-mcwiki-search/test  { query, title?, lang?, limit? }
 *
 * 持久化（标准 settings 存储，对齐 vision-bridge 与官方插件）：
 *  settings.yaml 顶层 `dshp-inx-mcwiki-search` 命名空间，工具与路由每次调用都读
 *  当前生效配置，外部编辑热重载无需重启。
 */

import {
  searchWiki,
  fetchPageIntro,
  fetchPageWikitext,
  fetchRandomPages,
  resolveApiBase,
  DEFAULT_API_BASE,
  DEFAULT_TIMEOUT_MS
} from './api.js'
import { wikitextToMarkdown, markdownToPlainText } from './convert.js'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace, installSettingsSection } from '@deepseek-ai/dsh-settings'

export const name = '@dshp-inx/mcwiki-search'
export const inject = ['tools', 'webServer']

// ── 官方 settings 命名空间与 schema（settings.yaml: dshp-inx-mcwiki-search）──
// 与包名 @dshp-inx/mcwiki-search / 路由 /etc 前缀保持一致。
// maxChars / introMaxChars = 0 表示不截断、完整输出（默认）。

export const NS = settingsNamespace('dshp-inx-mcwiki-search')

/** 配置默认值（settings base 层；用户层缺省即继承此处）。 */
const DEFAULT_CONFIG = {
  apiBase: DEFAULT_API_BASE,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxChars: 0,          // 全文输出上限：0 = 不截断
  introMaxChars: 0,     // 引言上限：0 = 不截断
  searchMaxResults: 8   // 搜索默认条数上限
}

export const ConfigSchema = z.object({
  apiBase: z.string().default(DEFAULT_API_BASE),
  timeoutMs: z.number().step(1).min(1000).default(DEFAULT_TIMEOUT_MS),
  maxChars: z.number().step(1).min(0).default(0),
  introMaxChars: z.number().step(1).min(0).default(0),
  searchMaxResults: z.number().step(1).min(1).default(8)
})

// ── 参数校验（裸 JSON Schema 无法表达边界，手工校验）────────────────────────

function requireQuery(value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('query 必须是非空字符串')
  return value.trim()
}

function intBetween(value, fallback, min, max, label) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} 必须是 ${min}–${max} 的整数`)
  return n
}

function optionalLang(value) {
  if (value === undefined || value === null || value === '') return undefined
  const lang = String(value).toLowerCase()
  if (lang !== 'zh' && lang !== 'en') throw new Error("lang 只能是 'zh' 或 'en'")
  return lang
}

function requireTitle(value) {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    throw new Error('必须提供 title（页面标题）或 pageid（页面 ID）')
  }
  return String(value).trim()
}

function optionalPageid(value) {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw new Error('pageid 必须是正整数')
  return n
}

// ── 模型可见输出格式化 ───────────────────────────────────────────────────────

function formatSearch(value) {
  const lines = []
  lines.push(`已在中${value.lang === 'en' ? '' : '文'} Minecraft Wiki 搜索「${value.query}」，共 ${value.totalHits} 条结果（显示前 ${value.results.length} 条）：\n`)
  value.results.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`)
    if (item.snippet.length > 0) lines.push(`   ${item.snippet}`)
    const meta = [item.url]
    if (item.updated.length > 0) meta.push(`更新于 ${item.updated.slice(0, 10)}`)
    lines.push(`   ${meta.join(' · ')}`)
  })
  if (value.truncated) lines.push(`\n（结果过多已截断，可用更精确的关键词缩小范围）`)
  lines.push('\n引用来源时请附上对应 URL。')
  return lines.join('\n')
}

function formatPage(value) {
  const lines = []
  lines.push(`# ${value.title}`)
  lines.push(`（${value.section === 'intro' ? '引言' : '全文'} · ${value.format} · 页面ID ${value.pageid}${value.updated ? ` · 更新于 ${value.updated.slice(0, 10)}` : ''}）\n`)
  if (value.text.length > 0) lines.push(value.text)
  else lines.push('（该页面暂无可用正文）')
  lines.push(`\n来源：${value.url}`)
  return lines.join('\n')
}

function formatRandom(value) {
  const lines = ['随机条目的引言（AI 可直接阅读）：\n']
  value.results.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`)
    if (item.text.length > 0) lines.push(`   ${item.text}`)
    lines.push(`   ${item.url}`)
  })
  return lines.join('\n')
}

/** 工具参数 → API 调用参数（不含 signal，signal 由 execute 注入）。 */
function buildParamsForTool(args, config) {
  return {
    apiBase: config.apiBase,
    timeoutMs: config.timeoutMs,
    lang: optionalLang(args.lang)
  }
}

// ── 工具注册 ─────────────────────────────────────────────────────────────────
// getConfig 为 thunk：每次执行都读当前生效配置，settings.yaml 外部编辑热重载无需重启。

function registerTools(ctx, getConfig) {
  /** 执行时上下文：把 exec.signal 合并进 API 调用。 */
  const run = (exec, args) => ({ ...args, signal: exec !== undefined ? exec.signal : undefined })

  ctx.tools.register({
    name: 'mcwiki_search',
    description: '搜索 Minecraft Wiki（默认中文 zh.minecraft.wiki，可传 lang=en 切英文 minecraft.wiki）。返回清洗后的 AI 可读结果：标题、摘要、页面 URL、更新时间。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: '搜索关键词，例如「钻石」「苦力怕」或 "Ancient City"。' },
        limit: { type: 'integer', description: '返回条数，1–20，默认 8。' },
        lang: { type: 'string', enum: ['zh', 'en'], description: '语言预设：zh=zh.minecraft.wiki，en=minecraft.wiki，默认 zh。' }
      },
      required: ['query']
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', const: true },
          query: { type: 'string' },
          lang: { type: 'string' },
          apiBase: { type: 'string' },
          totalHits: { type: 'integer' },
          truncated: { type: 'boolean' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                pageid: { type: 'integer' },
                url: { type: 'string' },
                snippet: { type: 'string' },
                updated: { type: 'string' }
              },
              required: ['title', 'pageid', 'url']
            }
          }
        },
        required: ['success', 'query', 'totalHits', 'results']
      },
      render: (_args, value) => [{ type: 'text', text: formatSearch(value) }]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const config = getConfig()
      const opts = {
        ...buildParamsForTool(args, config),
        query: requireQuery(args.query),
        limit: intBetween(args.limit, config.searchMaxResults, 1, 20, 'limit')
      }
      return searchWiki(run(exec, opts))
    }
  })

  ctx.tools.register({
    name: 'mcwiki_get_page',
    description: '抓取 Minecraft Wiki 页面并把内容转换成 AI 可直接阅读的格式，默认完整输出不截断。section=intro 返回纯文本引言（默认）；section=full 返回全文，format=markdown 返回 Markdown（默认）或 text 纯文本或 wikitext 原始源码。所有信息与细节都保留：模板/引用/噪声已清洗，正文完整。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: '页面标题，例如「苦力怕」或 "Diamond"。与 pageid 二选一。' },
        pageid: { type: 'integer', description: '页面 ID（来自 mcwiki_search 结果）。与 title 二选一。' },
        lang: { type: 'string', enum: ['zh', 'en'], description: '语言预设：zh/en，默认 zh。' },
        section: { type: 'string', enum: ['intro', 'full'], description: 'intro=引言纯文本；full=全文转换。默认 intro。' },
        format: { type: 'string', enum: ['markdown', 'text', 'wikitext'], description: 'full 时的输出格式：markdown/text/wikitext。默认 markdown。' },
        maxChars: { type: 'integer', description: '可选输出上限（字符）。0 或缺省 = 不截断、完整输出；传正整数才截断（如上下文紧张时 20000）。' }
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', const: true },
          title: { type: 'string' },
          pageid: { type: 'integer' },
          url: { type: 'string' },
          section: { type: 'string' },
          format: { type: 'string' },
          text: { type: 'string' },
          updated: { type: 'string' },
          truncated: { type: 'boolean' }
        },
        required: ['success', 'title', 'pageid', 'url', 'section', 'format', 'text']
      },
      render: (_args, value) => [{ type: 'text', text: formatPage(value) }]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const config = getConfig()
      const section = args.section === 'full' ? 'full' : 'intro'
      const format = section === 'full' && args.format !== undefined ? args.format : 'text'
      const pageid = optionalPageid(args.pageid)
      const title = pageid === undefined ? requireTitle(args.title) : undefined
      // 截断上限解析：工具参数优先；0/缺省 = 不截断；config 兜底（0 = 不截断）
      const requested = args.maxChars !== undefined ? Number(args.maxChars) : NaN
      const introMaxChars = Number.isFinite(requested) && requested > 0 ? requested
        : config.introMaxChars > 0 ? config.introMaxChars : undefined
      const fullMaxChars = Number.isFinite(requested) && requested > 0 ? requested
        : config.maxChars > 0 ? config.maxChars : undefined
      const common = {
        signal: exec !== undefined ? exec.signal : undefined,
        apiBase: config.apiBase,
        timeoutMs: config.timeoutMs,
        lang: optionalLang(args.lang),
        title,
        pageid
      }

      if (section === 'intro') {
        const result = await fetchPageIntro({ ...common, maxChars: introMaxChars })
        return {
          success: true,
          title: result.title,
          pageid: result.pageid,
          url: result.url,
          section: 'intro',
          format: 'text',
          text: result.text,
          ...(result.updated !== undefined ? { updated: result.updated } : {}),
          truncated: result.truncated
        }
      }

      const full = await fetchPageWikitext(common)
      if (format === 'wikitext') {
        let text = full.wikitext
        let truncated = false
        if (fullMaxChars !== undefined && text.length > fullMaxChars) {
          text = `${text.slice(0, fullMaxChars).trimEnd()}\n\n…（源码超过 ${fullMaxChars} 字符上限已截断，可传 maxChars=0 关闭截断）`
          truncated = true
        }
        return {
          success: true,
          title: full.title,
          pageid: full.pageid,
          url: full.url,
          section: 'full',
          format: 'wikitext',
          text,
          updated: full.updated,
          truncated
        }
      }
      const converted = wikitextToMarkdown(full.wikitext, { maxChars: fullMaxChars })
      const plain = format === 'text'
        ? markdownToPlainText(converted.markdown, { maxChars: fullMaxChars })
        : undefined
      const text = plain !== undefined ? plain.text : converted.markdown
      const truncated = plain !== undefined ? plain.truncated : converted.truncated
      return {
        success: true,
        title: full.title,
        pageid: full.pageid,
        url: full.url,
        section: 'full',
        format,
        text,
        updated: full.updated,
        truncated
      }
    }
  })

  ctx.tools.register({
    name: 'mcwiki_random',
    description: '随机获取 Minecraft Wiki 条目（含引言纯文本），适合探索未知内容或验证知识库覆盖。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', description: '返回条目数，1–10，默认 3。' },
        lang: { type: 'string', enum: ['zh', 'en'], description: '语言预设：zh/en，默认 zh。' }
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', const: true },
          lang: { type: 'string' },
          apiBase: { type: 'string' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                pageid: { type: 'integer' },
                url: { type: 'string' },
                text: { type: 'string' }
              },
              required: ['title', 'url']
            }
          }
        },
        required: ['success', 'results']
      },
      render: (_args, value) => [{ type: 'text', text: formatRandom(value) }]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const config = getConfig()
      return fetchRandomPages({
        signal: exec !== undefined ? exec.signal : undefined,
        apiBase: config.apiBase,
        timeoutMs: config.timeoutMs,
        lang: optionalLang(args.lang),
        limit: intBetween(args.limit, 5, 1, 10, 'limit'),
        maxIntroChars: config.introMaxChars
      })
    }
  })
}

// ── 同源 JSON 路由（设置页 / 验证用）───────────────────────────────────────

const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

const sameOrigin = (req) => {
  const origin = req.headers.origin
  if (origin === undefined) return true
  const host = req.headers.host
  return origin === `http://${host}` || origin === `https://${host}`
}

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  req.on('error', reject)
})

function registerRoutes(ctx, getConfig, updateConfig) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/ext/dshp-inx-mcwiki-search/state',
    handler: async (req, res) => {
      if (!sameOrigin(req)) return json(res, 403, { ok: false, error: 'forbidden' })
      const config = getConfig()
      json(res, 200, {
        ok: true,
        apiBase: resolveApiBase(config.apiBase),
        lang: resolveApiBase(config.apiBase).includes('zh.minecraft.wiki') ? 'zh' : 'en',
        timeoutMs: config.timeoutMs,
        maxChars: config.maxChars,
        introMaxChars: config.introMaxChars,
        searchMaxResults: config.searchMaxResults,
        config: snapshotOf(config),
        tools: ['mcwiki_search', 'mcwiki_get_page', 'mcwiki_random']
      })
    }
  }), 'dshp-inx-mcwiki-search: state route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/ext/dshp-inx-mcwiki-search/config',
    handler: async (req, res) => {
      if (!sameOrigin(req)) return json(res, 403, { ok: false, error: 'forbidden' })
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method not allowed' })
      let body = {}
      try { body = JSON.parse((await readBody(req)) || '{}') } catch { return json(res, 200, { ok: false, error: '请求体不是合法 JSON' }) }
      const a = (body && typeof body === 'object' && !Array.isArray(body)) ? body : {}
      try {
        const configPatch = {}
        let hasPatch = false
        if (Object.hasOwn(a, 'apiBase')) {
          if (typeof a.apiBase !== 'string' || a.apiBase.trim().length === 0) throw new Error('apiBase 非法，应为非空字符串')
          configPatch.apiBase = a.apiBase.trim()
          hasPatch = true
        }
        if (Object.hasOwn(a, 'timeoutMs')) {
          const n = Number(a.timeoutMs)
          if (!Number.isFinite(n) || n < 1000) throw new Error('timeoutMs 非法，应为 ≥1000 的毫秒数')
          configPatch.timeoutMs = n
          hasPatch = true
        }
        if (Object.hasOwn(a, 'maxChars')) {
          const n = Number(a.maxChars)
          if (!Number.isFinite(n) || n < 0) throw new Error('maxChars 非法，应为 ≥0 的整数（0 = 不截断）')
          configPatch.maxChars = n
          hasPatch = true
        }
        if (Object.hasOwn(a, 'introMaxChars')) {
          const n = Number(a.introMaxChars)
          if (!Number.isFinite(n) || n < 0) throw new Error('introMaxChars 非法，应为 ≥0 的整数（0 = 不截断）')
          configPatch.introMaxChars = n
          hasPatch = true
        }
        if (Object.hasOwn(a, 'searchMaxResults')) {
          const n = Number(a.searchMaxResults)
          if (!Number.isFinite(n) || n < 1) throw new Error('searchMaxResults 非法，应为 ≥1 的整数')
          configPatch.searchMaxResults = n
          hasPatch = true
        }
        if (hasPatch) await updateConfig(configPatch)
        const config = getConfig()
        return json(res, 200, {
          ok: true,
          config: {
            apiBase: config.apiBase,
            timeoutMs: config.timeoutMs,
            maxChars: config.maxChars,
            introMaxChars: config.introMaxChars,
            searchMaxResults: config.searchMaxResults
          }
        })
      } catch (error) {
        return json(res, 200, { ok: false, error: String((error && error.message) || error) })
      }
    }
  }), 'dshp-inx-mcwiki-search: config route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/ext/dshp-inx-mcwiki-search/test',
    handler: async (req, res) => {
      if (!sameOrigin(req)) return json(res, 403, { ok: false, error: 'forbidden' })
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method not allowed' })
      const startedAt = Date.now()
      try {
        const parsed = JSON.parse((await readBody(req)) || '{}')
        const query = parsed !== null && typeof parsed === 'object' && typeof parsed.query === 'string' ? parsed.query.trim() : ''
        if (query.length === 0) {
          return json(res, 200, { ok: false, error: '请输入测试查询', takenMs: Date.now() - startedAt })
        }
        const lang = parsed !== null && typeof parsed === 'object' && (parsed.lang === 'en' || parsed.lang === 'zh') ? parsed.lang : undefined
        const title = parsed !== null && typeof parsed === 'object' && typeof parsed.title === 'string' ? parsed.title.trim() : undefined
        const section = parsed !== null && typeof parsed === 'object' && parsed.section === 'full' ? 'full' : 'intro'

        const config = getConfig()
        const search = await searchWiki({ query, apiBase: config.apiBase, timeoutMs: config.timeoutMs, lang })
        let page = null
        if (search.results.length > 0) {
          const target = title !== undefined && title.length > 0 ? title : search.results[0].title
          if (section === 'intro') {
            const intro = await fetchPageIntro({ title: target, apiBase: config.apiBase, timeoutMs: config.timeoutMs, lang, maxChars: config.introMaxChars > 0 ? config.introMaxChars : undefined })
            page = { title: intro.title, section: 'intro', format: 'text', text: intro.text, url: intro.url }
          } else {
            const full = await fetchPageWikitext({ title: target, apiBase: config.apiBase, timeoutMs: config.timeoutMs, lang })
            // UI 预览保持有界（模型工具输出才是完整的）；6k 字符足够看清转换效果
            const converted = wikitextToMarkdown(full.wikitext, { maxChars: 6000 })
            page = { title: full.title, section: 'full', format: 'markdown', text: converted.markdown, url: full.url }
          }
        }

        return json(res, 200, {
          ok: true,
          query,
          lang: lang || (resolveApiBase(config.apiBase).includes('zh.minecraft.wiki') ? 'zh' : 'en'),
          totalHits: search.totalHits,
          results: search.results.slice(0, 5).map((item) => ({ title: item.title, snippet: item.snippet, url: item.url, updated: item.updated })),
          page,
          takenMs: Date.now() - startedAt
        })
      } catch (error) {
        return json(res, 200, {
          ok: false,
          error: String((error && error.message) || error),
          takenMs: Date.now() - startedAt
        })
      }
    }
  }), 'dshp-inx-mcwiki-search: test route')
}

// ── 插件入口 ────────────────────────────────────────────────────────────────

function sanitizePatchConfig(raw) {
  const base = raw !== null && typeof raw === 'object' ? raw : {}
  const config = {}
  if (typeof base.apiBase === 'string' && base.apiBase.trim().length > 0) config.apiBase = base.apiBase.trim()
  if (Number.isFinite(Number(base.timeoutMs)) && Number(base.timeoutMs) >= 1000) config.timeoutMs = Number(base.timeoutMs)
  // 0 = 不截断；正整数 = 上限字符数
  if (Number.isFinite(Number(base.maxChars)) && Number(base.maxChars) >= 0) config.maxChars = Number(base.maxChars)
  if (Number.isFinite(Number(base.introMaxChars)) && Number(base.introMaxChars) >= 0) config.introMaxChars = Number(base.introMaxChars)
  if (Number.isFinite(Number(base.searchMaxResults)) && Number(base.searchMaxResults) >= 1) config.searchMaxResults = Number(base.searchMaxResults)
  return config
}

function snapshotOf(config) {
  return {
    apiBase: config.apiBase,
    timeoutMs: config.timeoutMs,
    maxChars: config.maxChars,
    introMaxChars: config.introMaxChars,
    searchMaxResults: config.searchMaxResults
  }
}

export function apply(ctx, rawConfig) {
  // composition entry：默认值 ← patch 覆盖（settings 的 base 层）
  const entry = { ...DEFAULT_CONFIG, ...sanitizePatchConfig(rawConfig) }

  // 官方 settings：当前生效配置源（有 settings 时指向 scope.get()，否则指向 entry）
  let current = () => entry
  installSettingsSection(ctx, NS, ConfigSchema, entry, {
    setSource: (src) => { current = src },
    onChange: () => {}
  })

  function getConfig() {
    try {
      const v = current()
      if (v && typeof v === 'object') return { ...entry, ...v }
    } catch {}
    return { ...entry }
  }
  async function updateConfig(configPatch) {
    const settings = ctx.get('settings')
    if (!settings) throw new Error('settings 服务不可用，无法持久化到 settings.yaml（请重启 DSH 或检查 FileSettingsProvider 是否挂载）')
    await settings.update(NS, configPatch)
  }

  registerTools(ctx, getConfig)
  registerRoutes(ctx, getConfig, updateConfig)

  // 系统提示引导（可选服务；不存在则跳过，工具本身仍可用）
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined && typeof systemPrompt.section === 'function') {
    ctx.effect(() => systemPrompt.section({
      name: 'tool:mcwiki',
      order: 112,
      text: 'Minecraft Wiki 查询工具（mcwiki_search / mcwiki_get_page / mcwiki_random）：查询 Minecraft 官方知识库，返回已清洗的 AI 可读文本。搜到结果后如需详情，用 mcwiki_get_page 抓取页面；引用内容时附上页面 URL。'
    }), 'mcwiki-search: prompt section')
  }
}