import { generateKeyPairSync } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT } from './lib.mjs'

const keyId = process.argv[2] || `staging-${new Date().getUTCFullYear()}`
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(keyId)) {
  throw new Error('key id must be lowercase kebab-case')
}
const directory = join(ROOT.pathname, '.secrets')
await mkdir(directory, { recursive: true, mode: 0o700 })
const privatePath = join(directory, `${keyId}-private.pem`)
const publicPath = join(directory, `${keyId}-public.pem`)
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
await writeFile(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 })
await writeFile(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx', mode: 0o644 })
console.log(`Generated ${keyId}. Private key: ${privatePath}. Public key: ${publicPath}.`)
