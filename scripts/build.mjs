import { createPrivateKey, sign } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canonicalJson, loadAndValidate, ROOT, sha256 } from './lib.mjs'

const { catalog, documents } = await loadAndValidate()
const generatedAt = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : new Date().toISOString()
const contentFingerprint = sha256(canonicalJson({ catalog, documents })).slice(0, 16)
const revision = `${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}-${contentFingerprint}`
const outputRoot = join(ROOT.pathname, 'generated', revision)
await rm(outputRoot, { recursive: true, force: true })
await mkdir(join(outputRoot, 'sources'), { recursive: true })

const sourceFiles = []
for (const source of [...catalog.sources].sort((a, b) => a.order - b.order)) {
  const document = documents.find(candidate => candidate.sourceId === source.id)
  const ndjson = `${document.items.map(item => JSON.stringify({ ...item, sourceId: source.id, sourceLabel: source.label })).join('\n')}\n`
  const relativePath = `sources/${source.id}.ndjson`
  await writeFile(join(outputRoot, relativePath), ndjson)
  sourceFiles.push({
    ...source,
    path: `${revision}/${relativePath}`,
    sha256: sha256(ndjson),
    bytes: Buffer.byteLength(ndjson),
    itemCount: document.items.length,
  })
}

const privateKeyReference = process.env.CONTENT_SIGNING_PRIVATE_KEY
const keyId = privateKeyReference ? process.env.CONTENT_SIGNING_KEY_ID || 'default' : null
const payload = {
  schemaVersion: 1,
  revision,
  generatedAt,
  keyId,
  sources: sourceFiles,
}
let signature = null
if (privateKeyReference) {
  const privateKeyInput = privateKeyReference.includes('BEGIN PRIVATE KEY')
    ? privateKeyReference
    : await readFile(privateKeyReference, 'utf8')
  signature = sign(null, Buffer.from(canonicalJson(payload)), createPrivateKey(privateKeyInput)).toString('base64')
}
const manifest = { ...payload, signature }
await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Built ${revision}: ${sourceFiles.length} sources, ${sourceFiles.reduce((total, source) => total + source.itemCount, 0)} items${signature ? ', signed' : ', unsigned development manifest'}.`)
