const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

function componentHarness(file, overrides, activeTab = 'semua') {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const stubs = {};
  for (const declaration of ast.statements) {
    if (!ts.isImportDeclaration(declaration) || !declaration.importClause) continue;
    const clause = declaration.importClause;
    const stub = {};
    if (clause.name) stub.default = () => null;
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const binding of clause.namedBindings.elements) stub[(binding.propertyName || binding.name).text] = () => null;
    }
    const name = declaration.moduleSpecifier.text;
    const key = name.startsWith('.') ? `@/${path.normalize(path.join(path.dirname(file), name))}` : name;
    stubs[key] = { __esModule: true, ...stub };
  }
  const summary = { total: 1, open: 1, assigned: 0, close: 0 };
  return createHarness({
    ...stubs,
    react: {
      useState: initial => [initial === 'semua' ? activeTab : initial, () => {}],
      useMemo: fn => fn(), useEffect: () => {}, useCallback: fn => fn, useRef: value => ({ current: value }),
    },
    'next/navigation': { useSearchParams: () => new URLSearchParams(), usePathname: () => '/admin/ticket-management/kpi-customer', useRouter: () => ({}) },
    'next/dynamic': { default: () => () => null },
    '@/app/libs/query-keys': { queryKeys: { tickets: { all: ['tickets'] }, dashboard: { all: ['dashboard'] } } },
    '@/app/hooks/usePersistentWorkzoneScope': { usePersistentWorkzoneScope: () => ({ workzone: 'DMO' }) },
    '@/app/hooks/usePersistentBranchScope': { usePersistentBranchScope: () => ({ branch: '' }) },
    '@/app/hooks/useDailyTicketPage': { useDailyTicketPage: () => ({
      tickets: [], validasiTickets: [], summary, customerTypeSummary: {}, pagination: { total: 1, totalPages: 1 },
      validasiPagination: {}, validasiCount: 0, loading: false, error: null,
    }) },
    ...overrides,
  }, {}, { [file]: ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText });
}

test('bucket tabs fetch the visible list and keep inactive tabs on summaries or counts', () => {
  for (const tab of ['semua', 'b2c', 'b2b', 'close', 'gamas', 'validasi']) {
    const requests = [];
    const fake = { tickets: [], validasiTickets: [], summary: { total: 1 }, pagination: { total: 1, totalPages: 1 }, customerTypeSummary: {}, validasiPagination: {}, validasiCount: 0 };
    const file = 'app/admin/components/dashboard/TicketManagementBucketPage.tsx';
    const page = componentHarness(file, {
      '@/app/hooks/useDailyTicketPage': { useDailyTicketPage: options => { requests.push(options); return fake; } },
      '@tanstack/react-query': { useQueryClient: () => ({}) },
      '@/app/hooks/useTicketEvents': { useTicketEvents: () => {} },
      '@/app/libs/ticket-utils': { CLOSE_STATUS_VALUES: ['CLOSED'] },
    }, tab).load(file).default;
    page({ title: 'Customer', description: '', icon: '', tone: 'blue', operationalBucket: ['kpi_customer'] });
    const lists = requests.filter(request => request.enabled && !request.summaryOnly && !request.countOnly);
    assert.equal(lists.length, tab === 'validasi' ? 0 : 1, tab);
    if (tab === 'semua') assert.equal(lists[0].dept, 'all');
    if (tab === 'b2c' || tab === 'b2b') assert.equal(lists[0].dept, tab);
    if (tab === 'validasi') assert.equal(requests.filter(request => request.enabled && request.includeValidasiTickets).length, 2);
  }
});

test('sidebar uses one shared overview request instead of six daily list requests', () => {
  let requests = 0;
  let daily = 0;
  const file = 'app/components/layout/Sidebar.tsx';
  const sidebar = componentHarness(file, {
    '@/app/hooks/useCurrentUser': { useCurrentUser: () => ({ user: { role_name: 'superadmin', role_key: 'superadmin' } }) },
    '@/app/hooks/useDropdownOptions': { useWorkzoneOptions: () => ({ options: [] }) },
    '@/app/hooks/useTicketManagementOverview': { useTicketManagementOverview: () => { requests++; return {}; } },
    '@/app/hooks/useDailyTicketPage': { useDailyTicketPage: () => { daily++; } },
    '@/app/config/ticket-management-nav': { TICKET_MANAGEMENT_BUCKET_ITEMS: [] },
  }).load(file).default;
  sidebar({ isOpen: true, onClose: () => {}, selectedWorkzone: 'DMO' });
  assert.equal(requests, 1);
  assert.equal(daily, 0);
});

test('sync events coalesce refreshes and do not restart an active daily request', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let invalidate;
  const calls = [];
  const file = 'app/admin/components/dashboard/TicketManagementBucketPage.tsx';
  const page = componentHarness(file, {
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: options => calls.push(options) }) },
    '@/app/hooks/useTicketEvents': { useTicketEvents: options => { invalidate = options.onInvalidate; } },
    '@/app/libs/ticket-utils': { CLOSE_STATUS_VALUES: ['CLOSED'] },
  }).load(file).default;
  page({ title: 'Customer', description: '', icon: '', tone: 'blue', operationalBucket: ['kpi_customer'] });
  invalidate();
  invalidate();
  invalidate();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].predicate({ queryKey: ['tickets', 'daily'], state: { fetchStatus: 'fetching' } }), false);
  assert.equal(calls[0].predicate({ queryKey: ['tickets', 'daily'], state: { fetchStatus: 'idle' } }), true);
  t.mock.timers.tick(10000);
  assert.equal(calls.length, 4);
});
