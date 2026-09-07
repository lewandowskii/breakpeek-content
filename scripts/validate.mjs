import { loadAndValidate } from './lib.mjs'

const { catalog, documents } = await loadAndValidate()
const itemCount = documents.reduce((total, document) => total + document.items.length, 0)
console.log(`Validated ${catalog.sources.length} sources and ${itemCount} items.`)
