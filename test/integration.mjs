/**
 * mcwiki-search 集成测试（仓库内可移植版）。
 *
 * 与 profile 内版本不同：插件经相对路径导入，dsh-tools 支持通过
 * DSH_TOOLS_ENTRY 指定入口（否则按裸包名解析，需在 profile 目录内运行）。
 *
 * 运行：
 *   方式 A（profile 内，裸包解析）：
 *     cd ~/.dsh/profiles/web && node ../../plugins/dsh-mcwiki-search/test/integration.mjs
 *   方式 B（任意位置，显式指定 dsh-tools 入口）：
 *     DSH_TOOLS_ENTRY=/path/to/dsh-tools/lib/index.js node test/integration.mjs
 *
 * 验证：apply 注册 / schema 通过 DSH 校验 / 三个工具真实执行 / 测试路由 / settings 往返。
 */
const dshTools = await import(process.env.DSH_TOOLS_ENTRY || '@deepseek-ai/dsh-tools')
const { assertSupportedJsonSchema, validateJsonSchemaValue } = dshTools
const { apply } = await import('../lib/index.js')

// ── 最小 settings 服务（内存实现：base ← user 分层 + schema 校验）─────────
function createMockSettings() {
  const spaces = new Map()
  const api = {
    register(ns, schema, opts = {}) {
      if (spaces.has(ns)) throw new Error('duplicate ns ' + ns)
      const sp = { schema, base: { ...(opts.base || {}) }, user: {} }
      spaces.set(ns, sp)
      const resolve = () => sp.schema({ ...sp.base, ...sp.user })
      return { get: resolve, watch: () => () => {}, update: async (patch) => { await api.update(ns, patch) } }
    },
    get(ns) { const sp = spaces.get(ns); return sp ? sp.schema({ ...sp.base, ...sp.user }) : undefined },
    async update(ns, patch) {
      const sp = spaces.get(ns)
      if (!sp) throw new Error('unknown ns ' + ns)
      const next = { ...sp.user, ...(patch || {}) }
      sp.schema({ ...sp.base, ...next }) // 先校验再提交
      sp.user = next
    }
  }
  return api
}
const mockSettings = createMockSettings()

const tools = []
const routes = []
const ctx = {
  tools: { register(definition) { tools.push(definition); return () => {} } },
  webServer: { register(entry) { routes.push(entry) } },
  get(key) { if (key === 'settings') return mockSettings; return key === 'systemPrompt' ? undefined : undefined },
  inject(deps, cb) { if (deps.includes('settings')) cb({ ...ctx, settings: mockSettings }); return () => {} },
  effect(fn) { return fn() }
}

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures += 1
}

apply(ctx, {})
check('apply() 注册了 3 个工具', tools.length === 3, tools.map((t) => t.name).join(', '))
check('apply() 注册了 3 个路由', routes.length === 3, routes.map((r) => r.path).join(', '))

for (const tool of tools) {
  try {
    assertSupportedJsonSchema(tool.output.schema)
    assertSupportedJsonSchema({ type: 'object', properties: tool.parameters.properties })
    check(`${tool.name} schema 通过 DSH 校验`, true)
  } catch (error) {
    check(`${tool.name} schema 校验失败`, false, String((error && error.message) || error))
  }
}

const toolByName = Object.fromEntries(tools.map((t) => [t.name, t]))
const fakeExec = { signal: undefined }

async function runTool(name, args) {
  const tool = toolByName[name]
  const value = await tool.execute(args, fakeExec)
  const violations = validateJsonSchemaValue(tool.output.schema, value, '')
  if (violations.length > 0) throw new Error(`输出违反 schema: ${violations.join('; ')}`)
  const text = tool.output.render(args, value).map((b) => b.text).join('')
  return { value, text }
}

try {
  const search = await runTool('mcwiki_search', { query: '钻石', limit: 3 })
  check('mcwiki_search(钻石) 真实执行', search.value.results.length === 3, `共 ${search.value.totalHits} 条`)
  check('搜索输出无 HTML/模板/链接噪声', !/<[^>]+>|\{\{|\[\[/.test(search.text))
} catch (error) {
  check('mcwiki_search 真实执行', false, String((error && error.message) || error))
}

try {
  const intro = await runTool('mcwiki_get_page', { title: '苦力怕', section: 'intro' })
  check('mcwiki_get_page(苦力怕, intro)', intro.value.text.length > 50, `${intro.value.text.length} 字符纯文本`)
} catch (error) {
  check('mcwiki_get_page intro', false, String((error && error.message) || error))
}

try {
  const full = await runTool('mcwiki_get_page', { title: '钻石', section: 'full', format: 'markdown' })
  check('mcwiki_get_page(钻石, full, markdown) 默认完整输出不截断', full.value.truncated === false && full.value.text.length > 200,
    `${full.value.text.length} 字符，truncated=${full.value.truncated}`)
  const fullBounded = await runTool('mcwiki_get_page', { title: '钻石', section: 'full', format: 'markdown', maxChars: 500 })
  check('显式 maxChars=500 才截断并标记', fullBounded.value.truncated === true && fullBounded.value.text.includes('已截断'),
    `truncated=${fullBounded.value.truncated}`)
} catch (error) {
  check('mcwiki_get_page full', false, String((error && error.message) || error))
}

try {
  const random = await runTool('mcwiki_random', { limit: 3 })
  check('mcwiki_random(3)', random.value.results.length === 3, random.value.results.map((r) => r.title).join('、'))
} catch (error) {
  check('mcwiki_random', false, String((error && error.message) || error))
}

const testRoute = routes.find((r) => r.path === '/ext/dshp-inx-mcwiki-search/test')
const req = (body) => ({
  method: 'POST',
  headers: { host: '127.0.0.1:3080' },
  on(event, cb) { if (event === 'data') cb(Buffer.from(JSON.stringify(body))); else if (event === 'end') cb() }
})
let payload = null
const res = {
  writeHead() {},
  end(str) { payload = JSON.parse(str) }
}
try {
  await testRoute.handler(req({ query: '红石', limit: 3, section: 'intro' }), res)
  check('/ext/dshp-inx-mcwiki-search/test 路由', payload.ok === true && payload.totalHits > 0, `共 ${payload.totalHits} 条，${payload.takenMs} ms`)
} catch (error) {
  check('/ext/dshp-inx-mcwiki-search/test 路由', false, String((error && error.message) || error))
}

// ── settings 往返（离线）：config 校验 + 写入 + state 可见 ──────────────────
const configRoute = routes.find((r) => r.path === '/ext/dshp-inx-mcwiki-search/config')
const stateRoute = routes.find((r) => r.path === '/ext/dshp-inx-mcwiki-search/state')
const getReq = {
  method: 'GET',
  headers: { host: '127.0.0.1:3080' },
  on(event, cb) { if (event === 'data') cb(Buffer.from('{}')); else if (event === 'end') cb() }
}
try {
  payload = null
  await configRoute.handler(req({ timeoutMs: 50 }), res)
  check('config 拒绝非法 timeoutMs', payload.ok === false, payload.error)
  payload = null
  await configRoute.handler(req({ timeoutMs: 20000, searchMaxResults: 5 }), res)
  check('config 写入 settings', payload.ok === true && payload.config.timeoutMs === 20000 && payload.config.searchMaxResults === 5,
    JSON.stringify(payload.config))
  payload = null
  await stateRoute.handler(getReq, res)
  check('state 读到新配置', payload.ok === true && payload.config.timeoutMs === 20000)
} catch (error) {
  check('config 路由', false, String((error && error.message) || error))
}

console.log(failures === 0 ? '\n🎉 集成测试全部通过' : `\n💥 ${failures} 项失败`)
process.exitCode = failures > 0 ? 1 : 0