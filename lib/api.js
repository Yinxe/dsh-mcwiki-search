/**
 * mcwiki-search —— MediaWiki API 客户端 (api.js)
 *
 * 零依赖：仅使用全局 fetch（Node ≥ 20）。负责：
 *   - 语言预设（zh / en）与自定义 apiBase 解析
 *   - 统一 UA / 超时 / 取消信号
 *   - 三个查询能力：搜索、页面内容（intro 纯文本 / 全文 wikitext）、随机条目
 *
 * 所有返回都已按「AI 可读」归一化（字段精简、错误中文化），
 * 但「转换」本身（wikitext→Markdown 等）在 convert.js 完成，此处只做请求与归一化。
 */

import { cleanSearchSnippet, cleanTitle, cleanExtractText } from './convert.js'

/** 语言预设 → API 端点。 */
export const LANG_PRESETS = {
  zh: 'https://zh.minecraft.wiki/api.php',
  en: 'https://minecraft.wiki/api.php'
}

/** 默认出口：中文 Minecraft Wiki。 */
export const DEFAULT_API_BASE = LANG_PRESETS.zh

export const DEFAULT_TIMEOUT_MS = 15000
export const DEFAULT_USER_AGENT = 'mcwiki-search-dsh/1.0.0 (Minecraft Wiki query plugin; https://github.com/Yinxe/mcwiki-search)'

/**
 * 把用户给的 apiBase 归一化为 /api.php 端点。
 * 接受 "https://zh.minecraft.wiki/api.php" | "https://zh.minecraft.wiki/w/api.php"
 * | "https://zh.minecraft.wiki" | "zh" | "en"。
 */
export function resolveApiBase(apiBase) {
  if (apiBase === undefined || apiBase === null || apiBase === '') return DEFAULT_API_BASE
  const trimmed = String(apiBase).trim()
  if (LANG_PRESETS[trimmed] !== undefined) return LANG_PRESETS[trimmed]
  let url = trimmed
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  const pathMatch = /^(https?:\/\/[^/]+)(\/.*)?$/.exec(url)
  const origin = pathMatch ? pathMatch[1] : url
  const path = pathMatch && pathMatch[2] ? pathMatch[2] : ''
  if (/\/api\.php$/.test(path)) return url
  // 形如 /w/ 或 /wiki 的路径：末尾补 api.php
  const base = path === '' ? origin : origin + path.replace(/\/+$/, '')
  return /\/w$/.test(base) ? `${base}/api.php` : `${base}/api.php`
}

/** 语言参数 → apiBase：lang 为 'zh'/'en' 预设时覆盖默认端点。 */
export function apiBaseFor(lang, fallback) {
  if (lang !== undefined && LANG_PRESETS[lang] !== undefined) return LANG_PRESETS[lang]
  return resolveApiBase(fallback)
}

export function pageUrl(apiBase, title) {
  const base = resolveApiBase(apiBase).replace(/\/api\.php$/, '')
  return `${base}/w/${encodeURIComponent(String(title).replace(/ /g, '_'))}`
}

/**
 * 带超时与取消的 fetch 封装。
 * @param {string} url - 完整请求 URL。
 * @param {object} [opts] - { method, headers, body, signal, timeoutMs }。
 * @returns {Promise<object>} JSON 响应对象。
 * @throws 统一中文错误。
 */
export async function requestJson(url, opts = {}) {
  const timeoutMs = opts.timeoutMs !== undefined ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const signals = []
  if (opts.signal !== undefined) signals.push(opts.signal)
  signals.push(controller.signal)
  const signal = typeof AbortSignal.any === 'function' && signals.length > 1
    ? AbortSignal.any(signals)
    : signals[0]

  let response
  try {
    response = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        'user-agent': DEFAULT_USER_AGENT,
        accept: 'application/json',
        ...(opts.headers !== undefined ? opts.headers : {})
      },
      ...(opts.body !== undefined ? { body: opts.body } : {}),
      signal,
      redirect: 'follow'
    })
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(opts.signal !== undefined && opts.signal.aborted ? '请求已取消' : '请求超时，请稍后重试')
    }
    throw new Error(`网络请求失败：${String((error && error.message) || error)}`)
  } finally {
    clearTimeout(timer)
  }

  let parsed = null
  try {
    parsed = await response.json()
  } catch {
    parsed = null
  }
  if (!response.ok) {
    const info = parsed !== null && parsed.error ? parsed.error.info : ''
    throw new Error(`Minecraft Wiki API 响应 ${response.status}${info ? `：${info}` : ''}`)
  }
  if (parsed === null || typeof parsed !== 'object') throw new Error('Minecraft Wiki API 返回了无法解析的响应')
  if (parsed.error !== undefined) {
    const info = parsed.error.info || parsed.error.code || '未知错误'
    throw new Error(`Minecraft Wiki API 错误：${info}`)
  }
  return parsed
}

/** 拼接 MediaWiki action=query 请求 URL。 */
function queryUrl(apiBase, params) {
  const base = resolveApiBase(apiBase)
  const search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params })
  return `${base}?${search.toString()}`
}

/**
 * 全文搜索。
 * @param {object} opts - { query, limit?, lang?, apiBase?, signal?, timeoutMs? }。
 * @returns {Promise<object>} { success, query, lang, apiBase, totalHits, truncated, results }
 *   results[]: { title, pageid, url, snippet, updated } —— snippet 已清洗。
 */
export async function searchWiki(opts) {
  const query = typeof opts.query === 'string' ? opts.query.trim() : ''
  if (query.length === 0) throw new Error('查询词不能为空')
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 50)
  const apiBase = apiBaseFor(opts.lang, opts.apiBase)

  const data = await requestJson(queryUrl(apiBase, {
    list: 'search',
    srsearch: query,
    srlimit: limit,
    srnamespace: '0',
    srprop: 'snippet|timestamp|size|wordcount'
  }), { signal: opts.signal, timeoutMs: opts.timeoutMs })

  const hits = data.query !== undefined && data.query.searchinfo !== undefined ? Number(data.query.searchinfo.totalhits) || 0 : 0
  const items = Array.isArray(data.query !== undefined ? data.query.search : undefined) ? data.query.search : []
  const results = items.map((item) => ({
    title: cleanTitle(item.title),
    pageid: item.pageid,
    url: pageUrl(apiBase, item.title),
    snippet: cleanSearchSnippet(item.snippet !== undefined ? item.snippet : ''),
    updated: item.timestamp !== undefined ? String(item.timestamp) : ''
  })).filter((item) => item.title.length > 0)

  const truncated = limit < hits
  return {
    success: true,
    query,
    lang: resolveLangLabel(opts.lang, apiBase),
    apiBase: resolveApiBase(apiBase),
    totalHits: hits,
    truncated,
    results
  }
}

/** lang 展示标签：显式传入的 lang 优先，否则按端点推断。 */
function resolveLangLabel(lang, apiBase) {
  if (lang !== undefined && LANG_PRESETS[lang] !== undefined) return lang
  const base = resolveApiBase(apiBase)
  if (base.includes('zh.minecraft.wiki')) return 'zh'
  return 'en'
}

/** 解析 pageid / titles 查询的 pages 数组（formatversion=2）。 */
function resolvePages(apiBase, data, opts) {
  const query = data.query !== undefined ? data.query : {}
  const pages = Array.isArray(query.pages) ? query.pages : []
  const redirectedTo = {}
  if (Array.isArray(query.redirects)) {
    for (const r of query.redirects) {
      if (r.from !== undefined && r.to !== undefined) redirectedTo[r.from] = r.to
    }
  }
  if (pages.length === 0) {
    throw new Error('未找到该页面（可能不存在或已被删除）')
  }
  const page = pages[0]
  if (page === undefined || page.missing === true) {
    const wanted = opts.title !== undefined ? opts.title : (opts.pageid !== undefined ? `#${opts.pageid}` : '')
    throw new Error(`页面不存在：${wanted}`)
  }
  const effectiveTitle = redirectedTo[page.title] !== undefined ? redirectedTo[page.title] : page.title
  return { page, effectiveTitle }
}

/**
 * 获取页面「引言」纯文本（经 MediaWiki extracts explaintext 清洗）。
 * @param {object} opts - { title?, pageid?, lang?, apiBase?, maxChars?, signal?, timeoutMs? }。
 * @returns {Promise<object>} { success, title, pageid, url, section: 'intro', format: 'text', text, truncated }
 */
export async function fetchPageIntro(opts) {
  const apiBase = apiBaseFor(opts.lang, opts.apiBase)
  const params = {
    prop: 'extracts',
    explaintext: '1',
    exintro: '1',
    exlimit: '1',
    redirects: '1'
  }
  if (opts.pageid !== undefined) params.pageids = String(opts.pageid)
  else if (opts.title !== undefined) params.titles = String(opts.title)
  else throw new Error('必须提供 title 或 pageid')

  const data = await requestJson(queryUrl(apiBase, params), { signal: opts.signal, timeoutMs: opts.timeoutMs })
  const { page, effectiveTitle } = resolvePages(apiBase, data, opts)
  const extract = page.extract !== undefined ? page.extract : ''
  const cleaned = cleanExtractText(extract, { maxChars: opts.maxChars })
  return {
    success: true,
    title: cleanTitle(effectiveTitle),
    pageid: page.pageid,
    url: pageUrl(apiBase, effectiveTitle),
    section: 'intro',
    format: 'text',
    text: cleaned.text,
    truncated: cleaned.truncated
  }
}

/**
 * 获取页面全文 wikitext（供 markdown 转换 / 原始查看）。
 * @param {object} opts - { title?, pageid?, lang?, apiBase?, signal?, timeoutMs? }。
 * @returns {Promise<object>} { success, title, pageid, url, wikitext, updated }
 */
export async function fetchPageWikitext(opts) {
  const apiBase = apiBaseFor(opts.lang, opts.apiBase)
  const params = {
    prop: 'revisions',
    rvprop: 'content|timestamp',
    rvslots: 'main',
    rvlimit: '1',
    redirects: '1'
  }
  if (opts.pageid !== undefined) params.pageids = String(opts.pageid)
  else if (opts.title !== undefined) params.titles = String(opts.title)
  else throw new Error('必须提供 title 或 pageid')

  const data = await requestJson(queryUrl(apiBase, params), { signal: opts.signal, timeoutMs: opts.timeoutMs })
  const { page, effectiveTitle } = resolvePages(apiBase, data, opts)
  const revisions = Array.isArray(page.revisions) ? page.revisions : []
  const revision = revisions[0]
  const wikitext = revision !== undefined && revision.slots !== undefined && revision.slots.main !== undefined
    ? (revision.slots.main['*'] !== undefined ? revision.slots.main['*'] : revision.slots.main.content !== undefined ? revision.slots.main.content : '')
    : ''
  return {
    success: true,
    title: cleanTitle(effectiveTitle),
    pageid: page.pageid,
    url: pageUrl(apiBase, effectiveTitle),
    wikitext,
    updated: revision !== undefined && revision.timestamp !== undefined ? String(revision.timestamp) : ''
  }
}

/**
 * 随机条目。
 * @param {object} opts - { limit?, lang?, apiBase?, maxIntroChars?, signal?, timeoutMs? }。
 * @returns {Promise<object>} { success, lang, apiBase, results: [{title, pageid, url, text}] }
 *   text 为引言纯文本（AI 可直接阅读），默认不截断；maxIntroChars 传正整数才截断。
 */
export async function fetchRandomPages(opts) {
  const limit = Math.min(Math.max(Number(opts.limit) || 5, 1), 20)
  const maxIntroChars = opts.maxIntroChars !== undefined && Number(opts.maxIntroChars) > 0 ? Number(opts.maxIntroChars) : undefined
  const apiBase = apiBaseFor(opts.lang, opts.apiBase)

  const data = await requestJson(queryUrl(apiBase, {
    list: 'random',
    rnlimit: limit,
    rnnamespace: '0'
  }), { signal: opts.signal, timeoutMs: opts.timeoutMs })

  const items = Array.isArray(data.query !== undefined ? data.query.random : undefined) ? data.query.random : []
  const titles = items.map((item) => item.title).filter((title) => typeof title === 'string' && title.length > 0)

  const results = []
  if (titles.length > 0) {
    const introData = await requestJson(queryUrl(apiBase, {
      prop: 'extracts',
      explaintext: '1',
      exintro: '1',
      exlimit: Math.min(titles.length, 20),
      redirects: '1',
      titles: titles.join('|')
    }), { signal: opts.signal, timeoutMs: opts.timeoutMs })
    const pages = Array.isArray(introData.query !== undefined ? introData.query.pages : undefined)
      ? introData.query.pages
      : []
    const byTitle = new Map()
    for (const page of pages) {
      if (page !== undefined && page.title !== undefined) byTitle.set(page.title, page)
    }
    for (const title of titles) {
      const page = byTitle.get(title)
      const cleaned = cleanExtractText(page !== undefined ? page.extract : '', { maxChars: maxIntroChars })
      results.push({
        title: cleanTitle(title),
        pageid: page !== undefined ? page.pageid : undefined,
        url: pageUrl(apiBase, title),
        text: cleaned.text
      })
    }
  }
  return {
    success: true,
    lang: resolveLangLabel(opts.lang, apiBase),
    apiBase: resolveApiBase(apiBase),
    results
  }
}