/**
 * Pure helpers for page-load performance measurement.
 * No secrets, no I/O — safe to unit test from Vitest.
 */

export const PAGE_LOAD_WARNING_THRESHOLDS = {
  pageReadyMs: 5000,
  domContentLoadedMs: 3000,
  networkIdleMs: 7000,
}

/** @typedef {'guide' | 'admin' | 'vehicle'} PageLoadRole */

export const ALL_PAGE_LOAD_GROUPS = /** @type {const} */ (['guide', 'admin', 'vehicle'])

export const PAGE_LOAD_ROLE_ENV = {
  guide: { email: 'PERF_GUIDE_EMAIL', password: 'PERF_GUIDE_PASSWORD' },
  admin: { email: 'PERF_ADMIN_EMAIL', password: 'PERF_ADMIN_PASSWORD' },
  vehicle: { email: 'PERF_VEHICLE_EMAIL', password: 'PERF_VEHICLE_PASSWORD' },
}

/**
 * @typedef {{
 *   id: string
 *   role: PageLoadRole
 *   group: PageLoadRole
 *   path: string
 *   label: string
 *   contentMarker: string
 *   dynamic?: boolean
 * }} PageLoadRouteDef
 */

/** @type {PageLoadRouteDef[]} */
export const PAGE_LOAD_ROUTE_DEFS = [
  {
    id: 'guide-dashboard',
    role: 'guide',
    group: 'guide',
    path: '/guide',
    label: 'Guide dashboard',
    contentMarker: '배정된 투어',
  },
  {
    id: 'guide-settlements',
    role: 'guide',
    group: 'guide',
    path: '/guide/settlements',
    label: 'Guide settlement history',
    contentMarker: '전체 정산서',
  },
  {
    id: 'guide-settlement-edit',
    role: 'guide',
    group: 'guide',
    path: '/guide/settlements/__ID__/edit',
    label: 'Guide settlement edit',
    contentMarker: '임시저장',
    dynamic: true,
  },
  {
    id: 'guide-vehicle-reports',
    role: 'guide',
    group: 'guide',
    path: '/guide/vehicle-reports',
    label: 'Guide vehicle reports',
    contentMarker: '차량 리포트 확인',
  },
  {
    id: 'admin-dashboard',
    role: 'admin',
    group: 'admin',
    path: '/admin',
    label: 'Admin dashboard',
    contentMarker: '관리자 대시보드',
  },
  {
    id: 'admin-settlements',
    role: 'admin',
    group: 'admin',
    path: '/admin/settlements',
    label: 'Admin settlement list',
    contentMarker: '정산서 목록',
  },
  {
    id: 'admin-settlement-detail',
    role: 'admin',
    group: 'admin',
    path: '/admin/settlements/__ID__',
    label: 'Admin settlement detail',
    contentMarker: '정산 결과',
    dynamic: true,
  },
  {
    id: 'admin-tours',
    role: 'admin',
    group: 'admin',
    path: '/admin/tours',
    label: 'Admin tours',
    contentMarker: '투어 관리',
  },
  {
    id: 'admin-vehicle-assignments',
    role: 'admin',
    group: 'admin',
    path: '/admin/vehicle-assignments',
    label: 'Admin vehicle assignments',
    contentMarker: '차량회사 배정',
  },
  {
    id: 'vehicle-dashboard',
    role: 'vehicle',
    group: 'vehicle',
    path: '/vehicle',
    label: 'Vehicle company dashboard',
    contentMarker: '차량회사 리포트',
  },
  {
    id: 'vehicle-report-detail',
    role: 'vehicle',
    group: 'vehicle',
    path: '/vehicle/reports/__ID__',
    label: 'Vehicle report detail',
    contentMarker: '차량 리포트',
    dynamic: true,
  },
]

/** @type {Set<string>} */
export const PAGE_LOAD_ROUTE_IDS = new Set(PAGE_LOAD_ROUTE_DEFS.map((d) => d.id))

const SECRET_PATTERNS = [
  /PERF_[A-Z_]*PASSWORD[=:]\s*\S+/gi,
  /\b(password|token|access_token|refresh_token|apikey|api_key)\s*[:=]\s*["']?[^"'\s]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
]

/**
 * @param {string} text
 */
export function redactSecrets(text) {
  if (!text || typeof text !== 'string') return text
  let out = text
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]')
  }
  return out
}

/**
 * @param {unknown} value
 */
export function redactUnknown(value) {
  if (typeof value === 'string') return redactSecrets(value)
  if (Array.isArray(value)) return value.map(redactUnknown)
  if (value && typeof value === 'object') {
    const out = /** @type {Record<string, unknown>} */ ({})
    for (const [k, v] of Object.entries(value)) {
      if (/password|token|secret|authorization/i.test(k)) {
        out[k] = '[REDACTED]'
      } else {
        out[k] = redactUnknown(v)
      }
    }
    return out
  }
  return value
}

/**
 * @param {string | undefined} filterCsv
 */
export function parseRouteFilter(filterCsv) {
  if (!filterCsv?.trim()) return null
  const allowed = new Set(
    filterCsv
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
  return allowed.size ? allowed : null
}

/**
 * Split PERF_ROUTE_FILTER tokens into route ids and role groups.
 * Route ids (e.g. guide-vehicle-reports) take precedence for route list building;
 * groups (e.g. guide) still select all routes in that role.
 * @param {string | null | undefined} filterCsv
 */
export function classifyRouteFilter(filterCsv) {
  const tokens = parseRouteFilter(filterCsv)
  if (!tokens) return { routeIds: null, groups: null }

  /** @type {Set<string>} */
  const routeIds = new Set()
  /** @type {Set<PageLoadRole>} */
  const groups = new Set()

  for (const token of tokens) {
    if (PAGE_LOAD_ROUTE_IDS.has(token)) routeIds.add(token)
    else if (/** @type {readonly PageLoadRole[]} */ (ALL_PAGE_LOAD_GROUPS).includes(token)) {
      groups.add(/** @type {PageLoadRole} */ (token))
    }
  }

  return {
    routeIds: routeIds.size ? routeIds : null,
    groups: groups.size ? groups : null,
  }
}

/**
 * @param {PageLoadRouteDef} def
 * @param {ReturnType<typeof classifyRouteFilter>} classified
 */
export function routeMatchesFilter(def, classified) {
  if (!classified.routeIds && !classified.groups) return true
  if (classified.routeIds?.has(def.id)) return true
  if (classified.groups?.has(def.group)) return true
  return false
}

/**
 * Whether guide settlement edit should be measured.
 * Unset, empty, or "skip" disables the dynamic edit route.
 * @param {string | undefined | null} guideEditPathOption
 */
export function isGuideEditMeasurementEnabled(guideEditPathOption) {
  const raw = guideEditPathOption?.trim()
  return Boolean(raw && raw.toLowerCase() !== 'skip')
}

/**
 * Groups included in this measurement run.
 * Explicit PERF_ROUTE_FILTER limits scope; otherwise all roles are candidates.
 * @param {string | null | undefined} routeFilter
 */
export function resolveGroupsInScope(routeFilter) {
  const { routeIds, groups } = classifyRouteFilter(routeFilter)
  if (!routeIds && !groups) return new Set(ALL_PAGE_LOAD_GROUPS)

  if (routeIds) {
    /** @type {Set<PageLoadRole>} */
    const derived = new Set()
    for (const def of PAGE_LOAD_ROUTE_DEFS) {
      if (routeIds.has(def.id)) derived.add(def.group)
    }
    return derived
  }

  return groups
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {PageLoadRole} role
 */
export function hasRoleCredentials(env, role) {
  const keys = PAGE_LOAD_ROLE_ENV[role]
  return Boolean(env[keys.email]?.trim() && env[keys.password]?.trim())
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {PageLoadRole} role
 */
export function missingRoleCredentialEnvNames(env, role) {
  const keys = PAGE_LOAD_ROLE_ENV[role]
  const missing = []
  if (!env[keys.email]?.trim()) missing.push(keys.email)
  if (!env[keys.password]?.trim()) missing.push(keys.password)
  return missing
}

/**
 * Decide which roles to log in as based on route filter and available credentials.
 *
 * - Explicit PERF_ROUTE_FILTER: credentials are required for every filtered role.
 * - No filter: measure every role with complete credentials; skip others with warnings.
 *
 * @param {{
 *   routeFilter?: string | null
 *   env?: Record<string, string | undefined>
 * }} options
 */
export function resolveMeasurementCredentials(options = {}) {
  const env = options.env ?? {}
  const routeFilter = options.routeFilter ?? null
  const groupsInScope = resolveGroupsInScope(routeFilter)
  const explicitFilter = parseRouteFilter(routeFilter) !== null
  const warnings = []
  const skippedRoles = []
  const rolesToLogin = []

  for (const role of ALL_PAGE_LOAD_GROUPS) {
    if (!groupsInScope.has(role)) continue

    if (hasRoleCredentials(env, role)) {
      rolesToLogin.push(role)
      continue
    }

    if (explicitFilter) {
      const missing = missingRoleCredentialEnvNames(env, role)
      throw new Error(`Missing required env: ${missing[0]}`)
    }

    skippedRoles.push({
      role,
      reason: `missing credentials (${PAGE_LOAD_ROLE_ENV[role].email}, ${PAGE_LOAD_ROLE_ENV[role].password})`,
    })
    warnings.push(`Skipping ${role} routes: credentials not configured`)
  }

  return {
    groupsInScope: [...groupsInScope],
    explicitFilter,
    rolesToLogin,
    skippedRoles,
    warnings,
  }
}

/**
 * @param {{
 *   routeFilter?: string | null
 *   guideEditPath?: string
 *   adminDetailPath?: string
 *   vehicleReportPath?: string
 * }} options
 */
export function buildPageLoadRouteList(options = {}) {
  const classified = classifyRouteFilter(options.routeFilter)
  const overrides = {
    'guide-settlement-edit': isGuideEditMeasurementEnabled(options.guideEditPath)
      ? options.guideEditPath
      : undefined,
    'admin-settlement-detail': options.adminDetailPath,
    'vehicle-report-detail': options.vehicleReportPath,
  }

  const routes = []
  for (const def of PAGE_LOAD_ROUTE_DEFS) {
    if (!routeMatchesFilter(def, classified)) continue

    const override = overrides[/** @type {keyof typeof overrides} */ (def.id)]
    let path = def.path
    if (def.dynamic) {
      if (!override) continue
      path = override.startsWith('/') ? override : `/${override}`
    }

    routes.push({
      ...def,
      path,
    })
  }

  return routes
}

/**
 * @param {number[]} values
 * @param {number} p
 */
export function percentile(values, p) {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]
  const rank = (p / 100) * (sorted.length - 1)
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  if (low === high) return sorted[low]
  const weight = rank - low
  return sorted[low] * (1 - weight) + sorted[high] * weight
}

/**
 * @param {Array<number | undefined>} values
 */
export function summarizeNumeric(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) {
    return { count: 0, avg: undefined, min: undefined, max: undefined, p50: undefined }
  }
  const sum = nums.reduce((a, b) => a + b, 0)
  return {
    count: nums.length,
    avg: Math.round((sum / nums.length) * 100) / 100,
    min: Math.min(...nums),
    max: Math.max(...nums),
    p50: Math.round(percentile(nums, 50) * 100) / 100,
  }
}

/**
 * @param {{
 *   routeId: string
 *   path: string
 *   httpStatus?: number
 *   redirectCount?: number
 *   domContentLoadedMs?: number
 *   loadMs?: number
 *   networkIdleMs?: number
 *   mainContentMs?: number
 *   pageReadyMs?: number
 *   consoleErrors?: string[]
 *   finalPath?: string
 * }} run
 */
export function buildPageLoadRunWarnings(run) {
  const warnings = []
  const flags = {
    pageReadyOver5000: false,
    domContentLoadedOver3000: false,
    networkIdleOver7000: false,
    httpStatusNot200: false,
    consoleError: false,
    unexpectedRedirect: false,
  }

  if (typeof run.pageReadyMs === 'number' && run.pageReadyMs > PAGE_LOAD_WARNING_THRESHOLDS.pageReadyMs) {
    flags.pageReadyOver5000 = true
    warnings.push(
      `pageReadyMs ${run.pageReadyMs}ms exceeds ${PAGE_LOAD_WARNING_THRESHOLDS.pageReadyMs}ms`,
    )
  }
  if (
    typeof run.domContentLoadedMs === 'number' &&
    run.domContentLoadedMs > PAGE_LOAD_WARNING_THRESHOLDS.domContentLoadedMs
  ) {
    flags.domContentLoadedOver3000 = true
    warnings.push(
      `domContentLoadedMs ${run.domContentLoadedMs}ms exceeds ${PAGE_LOAD_WARNING_THRESHOLDS.domContentLoadedMs}ms`,
    )
  }
  if (
    typeof run.networkIdleMs === 'number' &&
    run.networkIdleMs > PAGE_LOAD_WARNING_THRESHOLDS.networkIdleMs
  ) {
    flags.networkIdleOver7000 = true
    warnings.push(
      `networkIdleMs ${run.networkIdleMs}ms exceeds ${PAGE_LOAD_WARNING_THRESHOLDS.networkIdleMs}ms`,
    )
  }
  if (typeof run.httpStatus === 'number' && run.httpStatus !== 200) {
    flags.httpStatusNot200 = true
    warnings.push(`HTTP status ${run.httpStatus} for ${run.path}`)
  }
  if (run.consoleErrors?.length) {
    flags.consoleError = true
    warnings.push(`console errors (${run.consoleErrors.length}) on ${run.path}`)
  }
  if (run.finalPath && run.path && run.finalPath !== run.path) {
    const loginRedirect = run.finalPath.includes('/login')
    if (!loginRedirect) {
      flags.unexpectedRedirect = true
      warnings.push(`unexpected redirect ${run.path} → ${run.finalPath}`)
    }
  }

  return { warnings, flags }
}

/**
 * @param {Array<{
 *   run: number
 *   routeId: string
 *   role: PageLoadRole
 *   path: string
 *   label: string
 *   ok: boolean
 *   error?: string
 *   httpStatus?: number
 *   redirectCount?: number
 *   domContentLoadedMs?: number
 *   loadMs?: number
 *   networkIdleMs?: number
 *   mainContentMs?: number
 *   pageReadyMs?: number
 *   finalPath?: string
 *   consoleErrors?: string[]
 * }>} runs
 * @param {{
 *   baseUrl: string
 *   runCount: number
 *   measuredAt: string
 *   routeFilter?: string | null
 *   skippedRoutes?: Array<{ id: string; reason: string }>
 * }} meta
 */
export function buildPageLoadReport(runs, meta) {
  const normalizedRuns = runs.map((run) => {
    const consoleErrors = (run.consoleErrors ?? []).map((e) => redactSecrets(e))
    const { warnings, flags } = buildPageLoadRunWarnings({
      routeId: run.routeId,
      path: run.path,
      httpStatus: run.httpStatus,
      redirectCount: run.redirectCount,
      domContentLoadedMs: run.domContentLoadedMs,
      loadMs: run.loadMs,
      networkIdleMs: run.networkIdleMs,
      mainContentMs: run.mainContentMs,
      pageReadyMs: run.pageReadyMs,
      consoleErrors,
      finalPath: run.finalPath,
    })
    return {
      ...run,
      consoleErrors,
      error: run.error ? redactSecrets(run.error) : undefined,
      warnings,
      warningFlags: flags,
    }
  })

  const routeIds = [...new Set(normalizedRuns.map((r) => r.routeId))]
  const byRoute = routeIds.map((routeId) => {
    const routeRuns = normalizedRuns.filter((r) => r.routeId === routeId)
    const sample = routeRuns[0]
    return {
      routeId,
      role: sample?.role,
      path: sample?.path,
      label: sample?.label,
      runs: routeRuns,
      summary: {
        pageReadyMs: summarizeNumeric(routeRuns.map((r) => r.pageReadyMs)),
        mainContentMs: summarizeNumeric(routeRuns.map((r) => r.mainContentMs)),
        domContentLoadedMs: summarizeNumeric(routeRuns.map((r) => r.domContentLoadedMs)),
        loadMs: summarizeNumeric(routeRuns.map((r) => r.loadMs)),
        networkIdleMs: summarizeNumeric(routeRuns.map((r) => r.networkIdleMs)),
      },
      warnings: [...new Set(routeRuns.flatMap((r) => r.warnings))],
    }
  })

  const ranking = [...byRoute]
    .map((r) => ({
      routeId: r.routeId,
      label: r.label,
      path: r.path,
      role: r.role,
      p50PageReadyMs: r.summary.pageReadyMs.p50 ?? -1,
      maxPageReadyMs: r.summary.pageReadyMs.max ?? -1,
    }))
    .sort((a, b) => b.p50PageReadyMs - a.p50PageReadyMs)

  const allWarnings = [...new Set(normalizedRuns.flatMap((r) => r.warnings))]
  const aggregateFlags = {
    pageReadyOver5000: normalizedRuns.some((r) => r.warningFlags.pageReadyOver5000),
    domContentLoadedOver3000: normalizedRuns.some((r) => r.warningFlags.domContentLoadedOver3000),
    networkIdleOver7000: normalizedRuns.some((r) => r.warningFlags.networkIdleOver7000),
    httpStatusNot200: normalizedRuns.some((r) => r.warningFlags.httpStatusNot200),
    consoleError: normalizedRuns.some((r) => r.warningFlags.consoleError),
    unexpectedRedirect: normalizedRuns.some((r) => r.warningFlags.unexpectedRedirect),
  }

  return redactUnknown({
    meta: {
      ...meta,
      thresholds: PAGE_LOAD_WARNING_THRESHOLDS,
      actionsPerformed: ['login', 'navigate', 'wait_for_content_marker'],
      actionsExcluded: [
        'save',
        'submit',
        'approve',
        'pay',
        'reopen',
        'recall',
        'send_for_confirmation',
        'field_mutation',
        'workflow_buttons',
      ],
    },
    runs: normalizedRuns,
    routes: byRoute,
    slowestRoutes: ranking,
    warnings: allWarnings,
    warningFlags: aggregateFlags,
  })
}
