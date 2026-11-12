const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');

function createHarness(overrides = {}, expose = {}, sources = {}) {
  const modules = new Map();
  const noop = () => {};
  const stubs = {
    '@/app/libs/prisma': { prisma: {}, prismaBulk: {} },
    '@/lib/observability/logger': { logger: { info: noop, warn: noop, error: noop } },
    '@/lib/redis': { isRedisReady: () => false, redis: {} },
    '@/lib/sync-metrics/metrics': new Proxy({}, { get: () => async () => {} }),
    '@/lib/observability/gauge-counters': new Proxy({}, { get: () => async () => {} }),
    '@/lib/workers/task-runner': { setMySQLSessionTimeout: async () => {} },
    '@/lib/ingestion/raw-writer-lock': { withTicketRawWriterLock: fn => fn(new AbortController().signal) },
    '@/lib/external-db/qosmic-bridge/client': {
      isQosmicBridgeConfigured: () => true,
      isQosmicBridgeDown: async () => false,
    },
    '@/lib/external-db/qosmic-bridge/nossa': {},
    '@/lib/external-db/connection': {},
    '@/app/libs/sseBroadcast': { broadcastTicketInvalidate: noop },
    '@/lib/classify-jenis-vlookup': {},
    '@/lib/dlq': {},
    ...overrides,
  };

  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    let code = ts.transpileModule(sources[path.relative(root, filename)] ?? readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2023,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText;
    if (expose[relative]) code += `\nmodule.exports.__test = { ${expose[relative].join(',')} };`;
    function dependency(id) {
      const resolved = id.startsWith('@/') ? path.join(root, id.slice(2))
        : id.startsWith('.') ? path.resolve(path.dirname(filename), id) : null;
      const alias = resolved ? `@/${path.relative(root, resolved)}` : id;
      if (Object.hasOwn(stubs, alias)) return stubs[alias];
      if (!resolved) return require(id);
      return load(path.relative(root, existsSync(`${resolved}.ts`) ? `${resolved}.ts` : `${resolved}/index.ts`));
    }
    new Function('require', 'module', 'exports', code)(dependency, module, module.exports);
    return module.exports;
  }
  return { load };
}

module.exports = { createHarness };
