import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
})

// Tokens live in memory; the refresh token is mirrored to localStorage so a
// page reload does not log the student out. Documented trade-off: an httpOnly
// cookie would be stronger, and needs the backend and frontend on one origin.
let accessToken = null
const REFRESH_KEY = 'geicis.refresh'

export function setTokens({ access, refresh }) {
  accessToken = access ?? null
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  accessToken = null
  localStorage.removeItem(REFRESH_KEY)
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY)
}

export function getAccessToken() {
  return accessToken
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// A single refresh in flight; concurrent 401s queue behind it instead of each
// firing their own refresh and invalidating one another under rotation.
let refreshing = null
const waiters = []

function onRefreshed(token) {
  waiters.forEach((resolve) => resolve(token))
  waiters.length = 0
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error
    const code = response?.data?.error?.code

    const isAuthEndpoint = config?.url?.includes('/auth/token')
    const shouldRefresh =
      response?.status === 401 && !config?._retried && !isAuthEndpoint && getRefreshToken()

    if (!shouldRefresh) return Promise.reject(error)

    config._retried = true

    if (!refreshing) {
      refreshing = axios
        .post(`${BASE_URL}/api/auth/token/refresh/`, { refresh: getRefreshToken() })
        .then(({ data }) => {
          setTokens({ access: data.access, refresh: data.refresh })
          onRefreshed(data.access)
          return data.access
        })
        .catch((err) => {
          clearTokens()
          onRefreshed(null)
          throw err
        })
        .finally(() => {
          refreshing = null
        })
    }

    const token = await new Promise((resolve) => {
      waiters.push(resolve)
      refreshing.catch(() => {})
    })

    if (!token) return Promise.reject(error)
    config.headers.Authorization = `Bearer ${token}`
    return api(config)
  },
)

/**
 * The `details` map flattened to one message per field, ready to hand to
 * `<Field error>`. DRF reports each field as a list; forms only show the first.
 */
export function fieldErrors(error) {
  const { details } = apiError(error)
  const flat = {}
  if (details && typeof details === 'object') {
    for (const [key, value] of Object.entries(details)) {
      flat[key] = Array.isArray(value) ? value[0] : String(value)
    }
  }
  return flat
}

/** The uniform error envelope, unwrapped. `message` is safe to render. */
export function apiError(error) {
  const payload = error?.response?.data?.error
  if (payload) return payload
  if (error?.message === 'Network Error') {
    return { code: 'NETWORK', message: 'Sem conexão com o servidor.', details: {} }
  }
  return { code: 'UNKNOWN', message: 'Algo deu errado. Tente de novo.', details: {} }
}
