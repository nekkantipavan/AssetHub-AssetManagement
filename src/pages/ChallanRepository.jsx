import React, { useState, useEffect } from 'react'
import {
  FileText, Folder, Upload, Search, Download, Trash2, Calendar,
  Filter, X, Check, Eye, AlertCircle, RefreshCw, File
} from 'lucide-react'
import { getChallans, uploadChallan, deleteChallan } from '../data/api'
import { useAuth } from '../context/AuthContext'
import Pagination from '../components/common/Pagination'

export default function ChallanRepository() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Admin'
  const isManagerOrAdmin = user?.role === 'Admin' || user?.role === 'Manager'

  const [documents, setDocuments] = useState([])
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize]       = useState(25)

  useEffect(() => { setCurrentPage(1) }, [selectedMonth, selectedType, search])

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [challanNo, setChallanNo] = useState('')
  const [challanType, setChallanType] = useState('Legacy')
  const [challanDate, setChallanDate] = useState(new Date().toISOString().substring(0, 10))
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [modalErr, setModalErr] = useState('')

  // PDF Preview modal state
  const [previewDoc, setPreviewDoc] = useState(null)

  useEffect(() => {
    fetchChallans()
  }, [selectedMonth, selectedType])

  async function fetchChallans() {
    setLoading(true)
    try {
      const params = {}
      if (selectedMonth) params.month = selectedMonth
      if (selectedType)  params.type  = selectedType
      if (search.trim()) params.search= search.trim()

      const res = await getChallans(params)
      setDocuments(res.data.documents || [])
      setMonths(res.data.months || [])
    } catch (err) {
      console.error('Failed to fetch challan documents:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault()
    fetchChallans()
  }

  async function handleUploadSubmit(e) {
    e.preventDefault()
    if (!uploadFile) {
      setModalErr('Please select a file to upload.')
      return
    }
    if (!challanNo.trim()) {
      setModalErr('Please enter a Challan Number.')
      return
    }

    setUploading(true)
    setModalErr('')

    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('challan_no', challanNo.trim())
      formData.append('challan_type', challanType)
      formData.append('challan_date', challanDate)
      formData.append('notes', notes)

      await uploadChallan(formData)
      setShowUploadModal(false)
      resetUploadForm()
      fetchChallans()
    } catch (err) {
      setModalErr(err.response?.data?.error || 'Failed to upload document')
    } finally {
      setUploading(false)
    }
  }

  function resetUploadForm() {
    setUploadFile(null)
    setChallanNo('')
    setChallanType('Legacy')
    setChallanDate(new Date().toISOString().substring(0, 10))
    setNotes('')
    setModalErr('')
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Are you sure you want to delete Challan ${doc.challan_no}?`)) return
    try {
      await deleteChallan(doc.id)
      fetchChallans()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete challan document')
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  function formatMonthName(monthStr) {
    if (!monthStr) return ''
    const [year, month] = monthStr.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    return date.toLocaleString('default', { month: 'long', year: 'numeric' })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-brand-600 dark:text-brand-400" />
            Challan Document Repository
          </h1>
          <p className="text-sm text-ink-500 dark:text-gray-400 mt-1">
            Store, search, and access historical delivery challans and system-generated PDFs categorized by month folders.
          </p>
        </div>

        {isManagerOrAdmin && (
          <button
            onClick={() => { resetUploadForm(); setShowUploadModal(true) }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm rounded-xl shadow-sm transition-colors self-start sm:self-auto"
          >
            <Upload size={18} />
            Upload Scanned Challan
          </button>
        )}
      </div>

      {/* Month Folders Navigation */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-ink-100 dark:border-gray-700 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-400 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Folder size={14} className="text-brand-500" />
            Month Directories
          </span>
          {selectedMonth && (
            <button
              onClick={() => setSelectedMonth('')}
              className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
            >
              Clear Month Filter
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedMonth('')}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              selectedMonth === ''
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-ink-50 dark:bg-gray-700 text-ink-700 dark:text-gray-300 hover:bg-ink-100 dark:hover:bg-gray-600'
            }`}
          >
            <Folder size={15} />
            All Month Folders
          </button>

          {months.map(m => (
            <button
              key={m.month_folder}
              onClick={() => setSelectedMonth(m.month_folder)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                selectedMonth === m.month_folder
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-ink-50 dark:bg-gray-700 text-ink-700 dark:text-gray-300 hover:bg-ink-100 dark:hover:bg-gray-600'
              }`}
            >
              <Folder size={15} className={selectedMonth === m.month_folder ? 'text-white' : 'text-amber-500'} />
              <span>{formatMonthName(m.month_folder)}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                selectedMonth === m.month_folder ? 'bg-brand-700 text-white' : 'bg-ink-200 dark:bg-gray-600 text-ink-600 dark:text-gray-300'
              }`}>
                {m.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-ink-100 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full sm:w-auto flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search by Challan No, filename, notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-ink-50 dark:bg-gray-700/60 border border-ink-100 dark:border-gray-600 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-ink-900 dark:bg-gray-700 hover:bg-ink-800 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-ink-400 dark:text-gray-400" />
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="py-2.5 px-3 bg-ink-50 dark:bg-gray-700 border border-ink-100 dark:border-gray-600 rounded-xl text-sm text-ink-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Document Types</option>
              <option value="Delivery">Delivery Challans</option>
              <option value="Return">Return Challans</option>
              <option value="Legacy">Legacy / Historical</option>
            </select>
          </div>

          <button
            onClick={fetchChallans}
            className="p-2.5 text-ink-500 hover:text-ink-900 dark:text-gray-400 dark:hover:text-white hover:bg-ink-50 dark:hover:bg-gray-700 rounded-xl transition-colors"
            title="Refresh List"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-ink-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-ink-400 dark:text-gray-400">
            <RefreshCw className="w-7 h-7 animate-spin mx-auto mb-2 text-brand-500" />
            Loading documents...
          </div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-ink-300 dark:text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-ink-800 dark:text-gray-200">No Challan Documents Found</h3>
            <p className="text-sm text-ink-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
              No files match your selected filters. Upload historical scans or generate delivery challans from approved transfers.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-ink-50/60 dark:bg-gray-700/50 text-ink-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider border-b border-ink-100 dark:border-gray-700">
                  <th className="py-3.5 px-4">Challan No & File</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Challan Date</th>
                  <th className="py-3.5 px-4">Month Folder</th>
                  <th className="py-3.5 px-4">Size</th>
                  <th className="py-3.5 px-4">Uploaded By</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-gray-700/60 text-sm">
                {documents.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(doc => (
                  <tr key={doc.id} className="hover:bg-ink-50/50 dark:hover:bg-gray-750 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
                          <FileText size={18} />
                        </div>
                        <div>
                          <div className="font-semibold text-ink-900 dark:text-white">
                            {doc.challan_no}
                          </div>
                          <div className="text-xs text-ink-400 dark:text-gray-400 truncate max-w-xs" title={doc.original_name}>
                            {doc.original_name}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        doc.challan_type === 'Delivery'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : doc.challan_type === 'Return'
                          ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {doc.challan_type}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-ink-700 dark:text-gray-300 whitespace-nowrap">
                      {new Date(doc.challan_date).toLocaleDateString()}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-ink-100 dark:bg-gray-700 text-ink-700 dark:text-gray-300">
                        <Folder size={13} className="text-amber-500" />
                        {doc.month_folder}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-xs font-mono text-ink-500 dark:text-gray-400">
                      {formatBytes(doc.file_size)}
                    </td>

                    <td className="py-3.5 px-4 text-xs text-ink-600 dark:text-gray-300">
                      {doc.uploader_name || 'System'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="p-2 text-ink-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400 hover:bg-ink-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Preview Document"
                        >
                          <Eye size={16} />
                        </button>

                        <a
                          href={`/api/challans/${doc.id}/download`}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-ink-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400 hover:bg-ink-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Download File"
                        >
                          <Download size={16} />
                        </a>

                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(doc)}
                            className="p-2 text-ink-400 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                            title="Delete File"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        totalItems={documents.length}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={sz => { setPageSize(sz); setCurrentPage(1) }}
      />

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full p-6 border border-ink-100 dark:border-gray-700">
            <div className="flex items-center justify-between pb-4 border-b border-ink-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
                <Upload className="text-brand-600 dark:text-brand-400" size={20} />
                Upload Scanned Challan
              </h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-ink-400 hover:text-ink-700 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {modalErr && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{modalErr}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1">
                  Challan File (PDF / Scanned Image) *
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setUploadFile(e.target.files[0] || null)}
                  className="w-full text-xs text-ink-600 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-gray-700 dark:file:text-brand-400 cursor-pointer"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1">
                    Challan Number *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DC-NSPL-AST-2627-001"
                    value={challanNo}
                    onChange={e => setChallanNo(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-gray-700 border border-ink-200 dark:border-gray-600 rounded-xl text-sm text-ink-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1">
                    Challan Type *
                  </label>
                  <select
                    value={challanType}
                    onChange={e => setChallanType(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-gray-700 border border-ink-200 dark:border-gray-600 rounded-xl text-sm text-ink-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="Legacy">Legacy / Historical</option>
                    <option value="Delivery">Delivery Challan</option>
                    <option value="Return">Return Challan</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1">
                  Challan Date * (Determines Month Folder)
                </label>
                <input
                  type="date"
                  value={challanDate}
                  onChange={e => setChallanDate(e.target.value)}
                  className="w-full px-3 py-2 bg-ink-50 dark:bg-gray-700 border border-ink-200 dark:border-gray-600 rounded-xl text-sm text-ink-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  required
                />
                <p className="text-[11px] text-ink-400 dark:text-gray-400 mt-1">
                  File will automatically route into folder: <span className="font-mono font-semibold text-brand-600 dark:text-brand-400">{challanDate ? challanDate.substring(0, 7) : 'YYYY-MM'}</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1">
                  Notes / Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Scanned copy of original signed vendor challan"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-ink-50 dark:bg-gray-700 border border-ink-200 dark:border-gray-600 rounded-xl text-sm text-ink-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-ink-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs font-medium text-ink-600 dark:text-gray-400 hover:bg-ink-50 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5"
                >
                  {uploading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>{uploading ? 'Uploading...' : 'Save & Archive File'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-ink-100 dark:border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-ink-100 dark:border-gray-700 bg-ink-50/50 dark:bg-gray-750">
              <div className="flex items-center gap-3">
                <FileText className="text-brand-600 dark:text-brand-400" size={20} />
                <div>
                  <h3 className="text-sm font-bold text-ink-900 dark:text-white">
                    {previewDoc.challan_no}
                  </h3>
                  <p className="text-xs text-ink-400 dark:text-gray-400">
                    {previewDoc.original_name} ({formatBytes(previewDoc.file_size)})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/api/challans/${previewDoc.id}/download`}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-xl transition-colors"
                >
                  <Download size={14} />
                  Download
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 text-ink-400 hover:text-ink-700 dark:hover:text-white rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-gray-100 dark:bg-gray-900 p-2 overflow-hidden">
              <iframe
                src={`/${previewDoc.file_path}`}
                className="w-full h-full rounded-xl border border-gray-300 dark:border-gray-700"
                title="Document Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
