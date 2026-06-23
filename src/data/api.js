import axios from 'axios'

const api = axios.create({
  baseURL: "/api",
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('ams_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    const isLoginRequest = err.config?.url?.includes('/auth/login')
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('ams_token')
      localStorage.removeItem('ams_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────
export const loginUser = data => api.post('/auth/login', data)
export const getMe     = ()   => api.get('/auth/me')

// ── Assets ───────────────────────────────────────────────────
export const getAssets   = ()         => api.get('/assets')
export const createAsset = data       => api.post('/assets', data)
export const updateAsset = (id, data) => api.put(`/assets/${id}`, data)
export const deleteAsset = id         => api.delete(`/assets/${id}`)
export const bulkUpload  = rows       => api.post('/assets/bulk', { rows })

// ── Plants ───────────────────────────────────────────────────
export const getPlants    = ()         => api.get('/plants')
export const createPlant  = data       => api.post('/plants', data)
export const updatePlant  = (id, data) => api.put(`/plants/${id}`, data)
export const deletePlant  = id         => api.delete(`/plants/${id}`)

// ── Departments ──────────────────────────────────────────────
export const getDepartments   = ()         => api.get('/departments')
export const createDepartment = data       => api.post('/departments', data)
export const updateDepartment = (id, data) => api.put(`/departments/${id}`, data)
export const deleteDepartment = id         => api.delete(`/departments/${id}`)

// ── Masters lookup ───────────────────────────────────────────
export const getMastersLookup = () => api.get('/masters/lookup')

// ── Asset Masters ────────────────────────────────────────────
export const getAssetMastersAll = ()         => api.get('/asset-masters/all')
export const getAssetMasters    = type       => api.get(`/asset-masters?type=${type}`)
export const createAssetMaster  = data       => api.post('/asset-masters', data)
export const updateAssetMaster  = (id, data) => api.put(`/asset-masters/${id}`, data)
export const deleteAssetMaster  = id         => api.delete(`/asset-masters/${id}`)

// ── Email Masters ────────────────────────────────────────────
export const getEmailMasters   = ()         => api.get('/email-masters')
export const createEmailMaster = data       => api.post('/email-masters', data)
export const updateEmailMaster = (id, data) => api.put(`/email-masters/${id}`, data)
export const deleteEmailMaster = id         => api.delete(`/email-masters/${id}`)

// ── Transfers ────────────────────────────────────────────────
export const getTransfers           = ()         => api.get('/transfers')
export const getTransfer            = id         => api.get(`/transfers/${id}`)
export const createTransfer         = data       => api.post('/transfers', data)
export const completeTransfer       = id         => api.put(`/transfers/${id}/complete`)
export const deleteTransfer         = id         => api.delete(`/transfers/${id}`)
export const resendTransferApproval = id         => api.post(`/transfers/${id}/resend-approval`)
export const getReturnableAssets    = id         => api.get(`/transfers/${id}/returnable`)
export const createReturn           = (id, data) => api.post(`/transfers/${id}/return`, data)
export const resendReturnApproval   = id         => api.post(`/transfer-returns/${id}/resend-approval`)
export const cancelReturn           = id         => api.delete(`/transfer-returns/${id}`)

// ── Users ────────────────────────────────────────────────────
export const getUsers   = ()         => api.get('/users')
export const getUser    = id         => api.get(`/users/${id}`)
export const createUser = data       => api.post('/users', data)
export const updateUser = (id, data) => api.put(`/users/${id}`, data)

// ── Notifications ────────────────────────────────────────────
export const getNotifications        = () => api.get('/notifications')
export const markAllNotificationsRead= () => api.put('/notifications/read-all')
export const markNotificationRead    = id => api.put(`/notifications/${id}/read`)

// ── Reports ──────────────────────────────────────────────────
export const getAssetReport    = () => api.get('/reports/assets')
export const getTransferReport = () => api.get('/reports/transfers')

// ── Audit Logs ───────────────────────────────────────────────
export const getAuditLogs = () => api.get('/audit-logs')

// ── Dashboard ────────────────────────────────────────────────
export const getDashboardStats = () => api.get('/dashboard/stats')

export default api
