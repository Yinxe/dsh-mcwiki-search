/**
 * mcwiki-search 集成测试（仓库内可移植版）。
 *
 * 与 profile 内版本不同：插件经相对路径导入，dsh-tools 支持通过
 * DSH_TOOLS_ENTRY 指定入口（否则按裸包名解析，需在 profile 目录内运行）。
 *
 * 运行：
 *   方式 A（profile 内，裸包解析）：
 *     cd ~/.dsh/profiles/web && node ../../plugins/mcwiki-search/test/integration.mjs
 *   方式 B（任意位置，显式指定 dsh-tools 入口）：
 *     DSH_TOOLS_ENTRY=/path/to/dsh-tools/lib/index.js node test/integration.mjs
 *
 * 验证：apply 注册 / schema 通过 DSH 校验 / 三个工具真实执行 / 测试路由。
 */
const dshTools = await import(process.env.DSH_TOOLS_ENTRY || '@deepseek-ai/dsh-tools')
const { assertSupportedJsonSchema, validateJsonSchemaValue } = dshTools
const { apply } = await import('../lib/index.js')

const tools = []
const routes = []
const ctx = {
  tools: { register(definition) { tools.push(definition); return () => {} } },
  webServer: { register(entry) { routes.push(entry) } },
  get(key) { return key === 'systemPrompt' ? undefined : undefined },
  effect(fn) { return fn() }
}

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures += 1
}

apply(ctx, {})
check('apply() 注册了 3 个工具', tools.length === 3, tools.map((t) => t.name).join(', '))
check('apply() 注册了 2 个路由', routes.length === 2, routes.map((r) => r.path).join(', '))

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

const testRoute = routes.find((r) => r.path === '/ext/mcwiki/test')
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
  check('/ext/mcwiki/test 路由', payload.ok === true && payload.totalHits > 0, `共 ${payload.totalHits} 条，${payload.takenMs} ms`)
} catch (error) {
  check('/ext/mcwiki/test 路由', false, String((error && error.message) || error))
}

console.log(failures === 0 ? '\n🎉 集成测试全部通过' : `\n💥 ${failures} 项失败`)
process.exitCode = failures > 0 ? 1 : 0