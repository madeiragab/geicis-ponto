import { api } from './client'

export const auth = {
  login: (email, password) => api.post('/auth/token/', { email, password }),
  refresh: (refresh) => api.post('/auth/token/refresh/', { refresh }),
  logout: (refresh) => api.post('/auth/logout/', { refresh }),
  register: (payload) => api.post('/auth/register/', payload),
  me: () => api.get('/auth/me/'),
  changePassword: (payload) => api.post('/auth/me/password/', payload),
  uploadAvatar: (file) => {
    const form = new FormData()
    form.append('avatar', file)
    return api.post('/auth/me/avatar/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  removeAvatar: () => api.delete('/auth/me/avatar/'),
}

export const internships = {
  list: (params) => api.get('/internships/', { params }),
  minimal: () => api.get('/internships/', { params: { minimal: 'true' } }),
  create: (payload) => api.post('/internships/', payload),
  update: (id, payload) => api.patch(`/internships/${id}/`, payload),
  remove: (id) => api.delete(`/internships/${id}/`),
  students: (id) => api.get(`/internships/${id}/students/`),
}

export const students = {
  list: (params) => api.get('/students/', { params }),
  get: (id) => api.get(`/students/${id}/`),
  update: (id, payload) => api.patch(`/students/${id}/`, payload),
  summary: (id) => api.get(`/students/${id}/summary/`),
  professors: (id) => api.get(`/students/${id}/professors/`),
}

export const professors = {
  list: () => api.get('/professors/'),
  students: (id) => api.get(`/professors/${id}/students/`),
}

export const supervisions = {
  list: () => api.get('/supervisions/'),
  create: (payload) => api.post('/supervisions/', payload),
  remove: (id) => api.delete(`/supervisions/${id}/`),
}

export const timeEntries = {
  checkIn: (notes) => api.post('/time-entries/check-in/', { notes }),
  checkOut: () => api.post('/time-entries/check-out/', {}),
  current: () => api.get('/time-entries/current/'),
  list: (params) => api.get('/time-entries/', { params }),
  adjust: (id, payload) => api.patch(`/time-entries/${id}/`, payload),
  remove: (id) => api.delete(`/time-entries/${id}/`),
}

export const ranking = {
  get: (params) => api.get('/ranking/', { params }),
}

export const dashboard = {
  get: () => api.get('/dashboard/'),
}

export const weeklyAlerts = {
  list: (params) => api.get('/weekly-alerts/', { params }),
}

export const users = {
  createStaff: (payload) => api.post('/users/', payload),
}
