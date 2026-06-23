import { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { Box, DollarSign, ArrowLeftRight, TrendingUp, AlertCircle } from 'lucide-react'
import StatCard from '../components/dashboard/StatCard'
import { Table, Thead, Th, Tbody, Tr, Td } from '../components/common/Table'
import { Badge } from '../components/common/Badge'
import { chartData } from '../data/dummyData'
import { getAssets, getTransfers } from '../data/api'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null
  return (
    <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 border-cream-200 dark:border-gray-700 dark:text-white rounded-2xl shadow-medium px-4 py-3 border border-cream-200 dark:border-gray-700">
      <p className="text-xs font-semibold text-ink-500 dark:text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [assets, setAssets] = useState([])
  const [transfers, setTransfers] = useState([])

  useEffect(() => {
    getAssets().then(res => setAssets(res.data)).catch(console.error)
    getTransfers().then(res => setTransfers(res.data)).catch(console.error)
  }, [])

  return (
    <div className="space-y-6 border-cream-200 dark:border-gray-700 dark:text-white">

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Box} label="Total Assets" value={assets.length} sub="Across all plants" highlight trend={12} />
        <StatCard icon={DollarSign} label="Total Value" value="₹--" sub="Acquisition value" trend={8} />
        <StatCard icon={ArrowLeftRight} label="Active Transfers" value={transfers.length} sub="Pending approvals" trend={-3} />
        <StatCard icon={TrendingUp} label="Added This Month" value="--" sub="-- disposed" trend={18} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-4">
        
        <div className="col-span-2 bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-3xl p-6">
          <h3 className="text-sm font-bold border-cream-200 dark:border-gray-700 dark:text-white mb-1">Asset Movement</h3>
          <p className="text-xs text-ink-300 dark:text-gray-400 dark:text-gray-400 mb-4">Last 6 months</p>

          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData.monthlyAssets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="added" stroke="#f59e0b" fill="#f59e0b33" />
              <Area type="monotone" dataKey="disposed" stroke="#fb923c" fill="#fb923c33" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-3xl p-6">
          <h3 className="text-sm font-bold border-cream-200 dark:border-gray-700 dark:text-white mb-1">By Category</h3>
          <p className="text-xs text-ink-300 dark:text-gray-400 dark:text-gray-400 mb-4">Asset distribution</p>

          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={chartData.byCategory} dataKey="value">
                {chartData.byCategory.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-3 gap-4">

        <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-3xl p-6">
          <h3 className="text-sm font-bold border-cream-200 dark:border-gray-700 dark:text-white mb-4">Transfer Trend</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData.transferTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="returnable" fill="#f59e0b" />
              <Bar dataKey="nonReturnable" fill="#fed7aa" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-2 bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-3xl p-6">
          <h3 className="text-sm font-bold border-cream-200 dark:border-gray-700 dark:text-white mb-4">Recent Assets</h3>
          <Table>
            <Thead>
              <Tr>
                <Th>Asset ID</Th><Th>Name</Th><Th>Location</Th><Th>Value</Th><Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {assets.slice(0, 5).map(a => (
                <Tr key={a.id}>
                  <Td className="text-brand-600">{a.id}</Td>
                  <Td>{a.name}</Td>
                  <Td className="text-ink-400 dark:text-gray-400">{a.location}</Td>
                  <Td>₹{a.value}</Td>
                  <Td><Badge label={a.status} /></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-3xl p-6">
        <h3 className="text-sm font-bold border-cream-200 dark:border-gray-700 dark:text-white mb-4 flex items-center gap-2">
          <AlertCircle size={16}/> Alerts
        </h3>

        <div className="space-y-2 text-sm">
          <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-2 rounded">
            6 transfers awaiting approval
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 p-2 rounded">
            3 assets near end of life
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-2 rounded">
            2 departments over asset limit
          </div>
        </div>
      </div>

    </div>
  )
}