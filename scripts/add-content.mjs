import { randomUUID } from 'node:crypto'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertValidItem, loadAndValidate, ROOT } from './lib.mjs'

const VALUE_FLAGS = new Set([
  'source', 'kind', 'title', 'summary', 'body', 'format', 'tags',
  'published-at', 'expires-at', 'source-url',
])

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`)
    const name = token.slice(2)
    if (!VALUE_FLAGS.has(name)) throw new Error(`Unknown option: --${name}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${name}`)
    if (values.has(name)) throw new Error(`Duplicate option: --${name}`)
    values.set(name, value)
    index += 1
  }
  return values
}

function required(values, name) {
  const value = values.get(name)
  if (!value) throw new Error(`Missing required option: --${name}`)
  return value
}

const values = parseArgs(process.argv.slice(2))
const sourceId = required(values, 'source')
const { catalog, documents } = await loadAndValidate()
const source = catalog.sources.find(candidate => candidate.id === sourceId)
if (!source) throw new Error(`Unknown source: ${sourceId}`)
const document = documents.find(candidate => candidate.sourceId === sourceId)

const item = {
  id: randomUUID(),
  kind: required(values, 'kind'),
  title: required(values, 'title'),
  summary: required(values, 'summary'),
  ...(values.has('body') ? { body: values.get('body') } : {}),
  bodyFormat: values.get('format') || 'plain',
  ...(values.has('published-at') ? { publishedAt: values.get('published-at') } : {}),
  ...(values.has('expires-at') ? { expiresAt: values.get('expires-at') } : {}),
  tags: values.has('tags')
    ? values.get('tags').split(',').map(tag => tag.trim()).filter(Boolean)
    : [],
  ...(values.has('source-url') ? { sourceUrl: values.get('source-url') } : {}),
}
assertValidItem(item, sourceId)

const outputPath = join(ROOT.pathname, 'sources', `${sourceId}.json`)
const temporaryPath = `${outputPath}.${process.pid}.tmp`
const nextDocument = { ...document, items: [...document.items, item] }
await writeFile(temporaryPath, `${JSON.stringify(nextDocument, null, 2)}\n`, { flag: 'wx' })
await rename(temporaryPath, outputPath)
console.log(`Added ${item.id} to ${source.label} (${sourceId}).`)
