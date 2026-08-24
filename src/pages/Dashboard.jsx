import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, PieChart, Pie, Cell
} from 'recharts'
import { Box, IndianRupee, ArrowLeftRight, ClipboardList, ArrowRight } from 'lucide-react'
import StatCard from '../components/dashboard/StatCard'
import { Table, Thead, Th, Tbody, Tr, Td } from '../components/common/Table'
import { Badge } from '../components/common/Badge'
import { getDashboardStats, getAssets, getAssetRequests } from '../data/api'

// Validated categorical palettes (see dataviz validator — light & dark tuned)
const PIE_LIGHT = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6']
const PIE_DARK  = ['#d97706', '#3b82f6', '#059669', '#8b5cf6', '#ef4444', '#0d9488']

// ── Helpers ──────────────────────────────────────────────────
const formatINRCompact = v => {
  const n = Number(v) || 0
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)} K`
  return `₹${n.toLocaleString('en-IN')}`
}

const formatINR = v =>
  v == null || v === '' ? '—'
  : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

// Group a list by a field into [{ label, value }] sorted desc, folding overflow into "Other"
function groupCount(items, key, topN = 7) {
  const map = {}
  for (const it of items) {
    const k = (it[key] || '').toString().trim() || 'Unassigned'
    map[k] = (map[k] || 0) + 1
  }
  const arr = Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
  if (arr.length <= topN) return arr
  const top = arr.slice(0, topN - 1)
  const restVal = arr.slice(topN - 1).reduce((s, d) => s + d.value, 0)
  // merge remainder into an existing "Other"/"Others" bucket if the data already has one
  const existing = top.find(d => /^others?$/i.test(d.label))
  if (existing) existing.value += restVal
  else top.push({ label: 'Other', value: restVal })
  return top
}

// Track dark mode (toggled via the `dark` class on <html>)
function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const v = p.value
  return (
    <div className="bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700 rounded-2xl shadow-medium px-3 py-2">
      <p className="text-xs font-semibold text-ink-700 dark:text-gray-200">{p.payload.label}</p>
      <p className="text-xs text-ink-500 dark:text-gray-400">{v} asset{v === 1 ? '' : 's'}</p>
    </div>
  )
}

function ChartCard({ title, subtitle, children, empty, emptyText = 'No data yet' }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-card border border-cream-200 dark:border-gray-700">
      <h3 className="text-sm font-bold text-ink-900 dark:text-white mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-ink-300 dark:text-gray-400 mb-4">{subtitle}</p>}
      {empty
        ? <p className="text-sm text-ink-300 dark:text-gray-500 py-12 text-center">{emptyText}</p>
        : children}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({ totalAssets: 0, totalValue: 0, pendingTransfers: 0, activePlants: 0 })
  const [assets, setAssets] = useState([])
  const [reqStats, setReqStats] = useState({ pending_dept_head: 0, waiting_asset_code: 0, pending_manager: 0 })
  const [loading, setLoading] = useState(true)
  const isDark = useIsDark()

  useEffect(() => {
    Promise.all([getDashboardStats(), getAssets(), getAssetRequests()])
      .then(([s, a, r]) => {
        setStats(s.data)
        setAssets(a.data)
        setReqStats(r.data.stats)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const byCategory = groupCount(assets, 'category', 7)
  const byLocation = groupCount(assets, 'plant_name', 6)
  const pie = isDark ? PIE_DARK : PIE_LIGHT

  const axisColor = isDark ? '#9ca3af' : '#6b7280'
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const barColor  = isDark ? '#fbbf24' : '#f59e0b'
  const surface   = isDark ? '#1f2937' : '#ffffff'

  const openRequests =
    (reqStats.pending_dept_head || 0) +
    (reqStats.waiting_asset_code || 0) +
    (reqStats.pending_manager || 0)

  const locationTotal = byLocation.reduce((s, d) => s + d.value, 0)

  // Real, actionable items — only non-zero ones are shown
  const attention = [
    { count: stats.pendingTransfers, label: 'Transfers awaiting approval', to: '/transfer' },
    { count: reqStats.pending_dept_head, label: 'Requests awaiting Dept Head', to: '/asset-requests' },
    { count: reqStats.waiting_asset_code, label: 'Requests awaiting asset codes', to: '/asset-requests' },
    { count: reqStats.pending_manager, label: 'Requests awaiting Manager', to: '/asset-requests' },
  ].filter(a => a.count > 0)

  if (loading) {
    return <div className="py-24 text-center text-sm text-ink-300 dark:text-gray-500">Loading dashboard…</div>
  }

  return (
    <div className="space-y-6">

      {/* KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Box} label="Total Assets" value={stats.totalAssets} sub={`${stats.activePlants} active plants`} highlight />
        <StatCard icon={IndianRupee} label="Total Value" value={formatINRCompact(stats.totalValue)} sub="Acquisition value" />
        <StatCard icon={ArrowLeftRight} label="Pending Transfers" value={stats.pendingTransfers} sub="Awaiting approval" />
        <StatCard icon={ClipboardList} label="Open Requests" value={openRequests} sub="Awaiting action" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Bar graph — assets by category */}
        <ChartCard title="Assets by Category" subtitle="Distribution across categories" empty={byCategory.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byCategory} margin={{ top: 20, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" stroke={axisColor} tickLine={false} axisLine={false}
                     tick={{ fontSize: 11 }} interval={0} />
              <YAxis stroke={axisColor} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
              <Tooltip cursor={{ fill: isDark ? '#ffffff10' : '#00000008' }} content={<ChartTooltip />} />
              <Bar dataKey="value" fill={barColor} radius={[6, 6, 0, 0]} maxBarSize={48}>
                <LabelList dataKey="value" position="top" fill={isDark ? '#e5e7eb' : '#4a4a4a'}
                           style={{ fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Donut — assets by location */}
        <ChartCard title="Assets by Location" subtitle="Distribution across plants" empty={byLocation.length === 0}>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-shrink-0" style={{ width: 200, height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byLocation} dataKey="value" nameKey="label"
                       innerRadius={62} outerRadius={92} paddingAngle={2} stroke={surface} strokeWidth={2}>
                    {byLocation.map((d, i) => <Cell key={d.label} fill={pie[i % pie.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-ink-900 dark:text-white tabular-nums">{locationTotal}</span>
                <span className="text-xs text-ink-300 dark:text-gray-400">Assets</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 w-full space-y-2">
              {byLocation.map((d, i) => (
                <div key={d.label} className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-md flex-shrink-0" style={{ background: pie[i % pie.length] }} />
                  <span className="text-sm text-ink-700 dark:text-gray-300 flex-1 truncate">{d.label}</span>
                  <span className="text-sm font-semibold text-ink-900 dark:text-white tabular-nums">{d.value}</span>
                  <span className="text-xs text-ink-300 dark:text-gray-500 tabular-nums w-10 text-right">
                    {locationTotal ? Math.round((d.value / locationTotal) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Recent assets + needs attention */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-card border border-cream-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Recent Assets</h3>
            <Link to="/assets" className="text-xs font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1 hover:gap-1.5 transition-all">
              View all <ArrowRight size={13} />
            </Link>
          </div>
          {assets.length === 0 ? (
            <p className="text-sm text-ink-300 dark:text-gray-500 py-8 text-center">No assets yet</p>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Asset Code</Th><Th>Name</Th><Th>Location</Th><Th>Value</Th><Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {assets.slice(0, 6).map(a => (
                  <Tr key={a.id}>
                    <Td className="text-brand-600 dark:text-brand-400 font-medium">{a.asset_code}</Td>
                    <Td className="dark:text-gray-200">{a.name}</Td>
                    <Td className="text-ink-400 dark:text-gray-400">{a.plant_name || '—'}</Td>
                    <Td className="dark:text-gray-200">{formatINR(a.acquisition_value)}</Td>
                    <Td><Badge label={a.status} /></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-card border border-cream-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-ink-900 dark:text-white mb-4">Needs Attention</h3>
          {attention.length === 0 ? (
            <p className="text-sm text-ink-400 dark:text-gray-400 py-6 text-center">You're all caught up 🎉</p>
          ) : (
            <div className="space-y-2">
              {attention.map((a, i) => (
                <Link
                  key={i}
                  to={a.to}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-cream-100 dark:bg-gray-700/50 hover:bg-cream-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="text-sm text-ink-700 dark:text-gray-300">{a.label}</span>
                  <span className="text-sm font-bold text-brand-600 dark:text-brand-400 tabular-nums flex-shrink-0">{a.count}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
