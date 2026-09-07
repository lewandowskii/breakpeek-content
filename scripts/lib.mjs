import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export const ROOT = new URL('../', import.meta.url)
export const MAX_SUMMARY_CHARS = 200
export const MAX_BODY_BYTES = 8192
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ITEM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const KINDS = new Set(['interview', 'news', 'tip', 'joke'])
const FORMATS = new Set(['plain', 'markdown'])

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message)
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
}

function validateItem(item, sourceId, position, errors) {
  const at = `${sourceId}.items[${position}]`
  assert(item && typeof item === 'object' && !Array.isArray(item), `${at} must be an object`, errors)
  if (!item || typeof item !== 'object' || Array.isArray(item)) return
  const allowed = new Set(['id', 'kind', 'title', 'summary', 'body', 'bodyFormat', 'publishedAt', 'expiresAt', 'tags', 'sourceUrl'])
  for (const key of Object.keys(item)) assert(allowed.has(key), `${at}.${key} is not supported`, errors)
  assert(typeof item.id === 'string' && ITEM_ID_PATTERN.test(item.id), `${at}.id must be a lowercase UUID v4`, errors)
  assert(KINDS.has(item.kind), `${at}.kind is invalid`, errors)
  assert(typeof item.title === 'string' && item.title.length > 0 && [...item.title].length <= 80, `${at}.title must contain 1-80 characters`, errors)
  assert(typeof item.summary === 'string' && item.summary.length > 0 && [...item.summary].length <= MAX_SUMMARY_CHARS, `${at}.summary must contain 1-${MAX_SUMMARY_CHARS} characters`, errors)
  assert(item.body === undefined || (typeof item.body === 'string' && item.body.length > 0 && Buffer.byteLength(item.body) <= MAX_BODY_BYTES), `${at}.body must contain 1-${MAX_BODY_BYTES} bytes`, errors)
  assert(FORMATS.has(item.bodyFormat), `${at}.bodyFormat is invalid`, errors)
  assert(Array.isArray(item.tags) && new Set(item.tags).size === item.tags.length && item.tags.every(tag => typeof tag === 'string' && tag.length > 0 && [...tag].length <= 32), `${at}.tags must be unique non-empty strings`, errors)
  if (item.publishedAt !== undefined) assert(isIsoDate(item.publishedAt), `${at}.publishedAt must be ISO 8601 with timezone`, errors)
  if (item.expiresAt !== undefined) assert(isIsoDate(item.expiresAt), `${at}.expiresAt must be ISO 8601 with timezone`, errors)
  if (item.publishedAt && item.expiresAt) assert(Date.parse(item.expiresAt) > Date.parse(item.publishedAt), `${at}.expiresAt must be after publishedAt`, errors)
  if (item.sourceUrl !== undefined) assert(typeof item.sourceUrl === 'string' && item.sourceUrl.startsWith('https://'), `${at}.sourceUrl must use HTTPS`, errors)
  const text = `${item.title ?? ''}\n${item.summary ?? ''}\n${item.body ?? ''}`
  assert(!/<\/?[a-z][^>]*>/i.test(text), `${at} contains raw HTML`, errors)
}

export function assertValidItem(item, sourceId = 'new-item') {
  const errors = []
  validateItem(item, sourceId, 0, errors)
  if (errors.length > 0) throw new Error(`Content item validation failed:\n- ${errors.join('\n- ')}`)
}

export async function loadAndValidate() {
  const errors = []
  const catalogPath = join(ROOT.pathname, 'catalog.json')
  const catalog = await readJson(catalogPath)
  assert(catalog.schemaVersion === 1, 'catalog.schemaVersion must be 1', errors)
  assert(Array.isArray(catalog.sources) && catalog.sources.length > 0, 'catalog.sources must be non-empty', errors)
  const sourceIds = new Set()
  const sourceOrders = new Set()
  for (const [position, source] of (catalog.sources ?? []).entries()) {
    const at = `catalog.sources[${position}]`
    assert(source && typeof source === 'object', `${at} must be an object`, errors)
    if (!source || typeof source !== 'object') continue
    assert(typeof source.id === 'string' && SOURCE_ID_PATTERN.test(source.id), `${at}.id must be kebab-case`, errors)
    assert(!sourceIds.has(source.id), `${at}.id is duplicated`, errors)
    sourceIds.add(source.id)
    assert(typeof source.label === 'string' && source.label.length > 0 && [...source.label].length <= 40, `${at}.label is invalid`, errors)
    assert(typeof source.description === 'string' && source.description.length > 0 && [...source.description].length <= 120, `${at}.description is invalid`, errors)
    assert(typeof source.defaultEnabled === 'boolean', `${at}.defaultEnabled must be boolean`, errors)
    assert(Number.isSafeInteger(source.order) && source.order >= 0, `${at}.order must be a non-negative integer`, errors)
    assert(!sourceOrders.has(source.order), `${at}.order is duplicated`, errors)
    sourceOrders.add(source.order)
  }

  const files = (await readdir(join(ROOT.pathname, 'sources'))).filter(file => file.endsWith('.json')).sort()
  const documents = []
  const globalItemIds = new Set()
  for (const file of files) {
    const document = await readJson(join(ROOT.pathname, 'sources', file))
    assert(document.schemaVersion === 1, `${file}.schemaVersion must be 1`, errors)
    assert(sourceIds.has(document.sourceId), `${file}.sourceId is missing from catalog`, errors)
    assert(file === `${document.sourceId}.json`, `${file} must match sourceId`, errors)
    assert(Array.isArray(document.items) && document.items.length > 0, `${file}.items must be non-empty`, errors)
    for (const [position, item] of (document.items ?? []).entries()) {
      validateItem(item, document.sourceId, position, errors)
      if (item && typeof item.id === 'string') {
        assert(!globalItemIds.has(item.id), `${file}: item id ${item.id} is duplicated globally`, errors)
        globalItemIds.add(item.id)
      }
    }
    documents.push(document)
  }
  for (const sourceId of sourceIds) assert(documents.some(document => document.sourceId === sourceId), `missing sources/${sourceId}.json`, errors)
  if (errors.length > 0) throw new Error(`Content validation failed:\n- ${errors.join('\n- ')}`)
  return { catalog, documents }
}
