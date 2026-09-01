#!/usr/bin/env node
/**
 * mcwiki-search —— 自测 CLI。
 *
 * 不依赖 DSH/cordis 运行时，直接驱动 api.js + convert.js 的完整管线：
 *   1. 搜索（默认「钻石」，可传自定义查询词，如 node lib/self-test.js 苦力怕 en）
 *   2. 抓取首个结果的引言（纯文本）
 *   3. 抓取全文并转 Markdown（展示转换管线）
 *   4. 随机条目（引言）
 *
 * 用法：
 *   node lib/self-test.js                 # 中文搜索「钻石」
 *   node lib/self-test.js 苦力怕          # 中文搜索「苦力怕」
 *   node lib/self-test.js Ancient City en  # 英文搜索
 *   node lib/self-test.js --no-page       # 跳过页面抓取（仅搜索）
 */

import { searchWiki, fetchPageIntro, fetchPageWikitext, fetchRandomPages } from './api.js'
import { wikitextToMarkdown } from './convert.js'

const args = process.argv.slice(2)
const noPage = args.includes('--no-page')
const positional = args.filter((arg) => !arg.startsWith('--'))
const query = positional[0] !== undefined ? positional[0] : '钻石'
const lang = positional[1] !== undefined && (positional[1] === 'en' || positional[1] === 'zh') ? positional[1] : undefined

const ok = (label, value) => {
  console.log(`\n${'═'.repeat(64)}\n${label}\n${'═'.repeat(64)}\n`)
  console.log(value)
}

const summary = {
  search: { ok: false }, intro: { ok: false }, full: { ok: false }, random: { ok: false }
}
let failures = 0

try {
  const search = await searchWiki({ query, limit: 5, lang })
  summary.search = { ok: true, totalHits: search.totalHits, results: search.results.length }
  ok(`① 搜索「${query}」(${lang || 'zh'}) — 共 ${search.totalHits} 条，展示 ${search.results.length} 条`, search.results.map((item, i) => `${i + 1}. ${item.title}\n   ${item.snippet}\n   ${item.url} · 更新 ${item.updated.slice(0, 10)}`).join('\n'))

  if (!noPage && search.results.length > 0) {
    const firstTitle = search.results[0].title
    // ② 引言
    try {
      const intro = await fetchPageIntro({ title: firstTitle, lang })
      summary.intro = { ok: true, title: intro.title }
      ok(`② 引言（extracts 纯文本）—— ${intro.title}`, intro.text)
    } catch (error) {
      summary.intro = { ok: false, error: String((error && error.message) || error) }
      console.log(`\n② 引言抓取失败：${summary.intro.error}`)
      failures += 1
    }
    // ③ 全文 → Markdown（默认完整输出、不截断）
    try {
      const full = await fetchPageWikitext({ title: firstTitle, lang })
      // 3a. 默认（不传 maxChars）：完整输出、不截断
      const fullConverted = wikitextToMarkdown(full.wikitext)
      summary.full = { ok: true, title: full.title, wikitextChars: full.wikitext.length, markdownChars: fullConverted.markdown.length, truncated: fullConverted.truncated }
      ok(`③A 全文 wikitext(${full.wikitext.length}字符) → Markdown(${fullConverted.markdown.length}字符) · 完整输出不截断(${fullConverted.truncated ? '✗ 被截断' : '✓'}) — ${full.title}`,
        `${fullConverted.markdown.slice(0, 900)}${fullConverted.markdown.length > 900 ? '\n…（此处仅为展示截取，真实返回为完整全文）' : ''}`)
      // 3b. 显式上限（预览语义）仍可用
      const bounded = wikitextToMarkdown(full.wikitext, { maxChars: 1200 })
      summary.fullPreview = { ok: true, markdownChars: bounded.markdown.length, truncated: bounded.truncated }
      ok(`③B 显式 maxChars=1200 预览模式：${bounded.markdown.length} 字符，truncated=${bounded.truncated}（仅当主动设限时才截断）`, bounded.markdown.slice(0, 300))
    } catch (error) {
      summary.full = { ok: false, error: String((error && error.message) || error) }
      console.log(`\n③ 全文抓取/转换失败：${summary.full.error}`)
      failures += 1
    }
  }
} catch (error) {
  summary.search = { ok: false, error: String((error && error.message) || error) }
  console.log(`\n① 搜索失败：${summary.search.error}`)
  failures += 1
}

try {
  const random = await fetchRandomPages({ limit: 3, lang })
  summary.random = { ok: true, results: random.results.length }
  ok(`④ 随机条目 — ${random.results.length} 条`, random.results.map((item, i) => `${i + 1}. ${item.title}\n   ${item.text.slice(0, 200)}${item.text.length > 200 ? '…' : ''}\n   ${item.url}`).join('\n'))
} catch (error) {
  summary.random = { ok: false, error: String((error && error.message) || error) }
  console.log(`\n④ 随机条目失败：${summary.random.error}`)
  failures += 1
}

console.log(`\n${'═'.repeat(64)}\n自测汇总\n${'═'.repeat(64)}`)
console.log(JSON.stringify(summary, null, 2))
if (failures > 0) {
  console.log(`\n❌ ${failures} 项失败`)
  process.exitCode = 1
} else {
  console.log('\n✅ 全部通过：搜索 / 引言 / 全文转 Markdown / 随机条目 均正常，输出均为 AI 可读文本。')
}