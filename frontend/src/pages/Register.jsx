import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react'
import { apiError } from '../api/client'
import { auth, internships as internshipsApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { Button, Card, Field, Input, Select } from '../components/ui'

const STRENGTH_LABELS = ['muito fraca', 'fraca', 'razoável', 'boa', 'forte']

function strengthOf(password) {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return Math.min(4, score)
}

export default function Register() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [step, setStep] = useState(1)
  const [options, setOptions] = useState([])
  const [errors, setErrors] = useState({})
  const [topError, setTopError] = useState(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    registration_number: '',
    password: '',
    password_confirm: '',
    internship_id: '',
    required_hours: 300,
    weekly_minimum_hours: 20,
    started_at: new Date().toISOString().slice(0, 10),
    expected_end_at: '',
  })

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  useEffect(() => {
    internshipsApi
      .minimal()
      .then(({ data }) => setOptions(data))
      .catch(() => setOptions([]))
  }, [])

  const strength = strengthOf(form.password)

  // A hint, not a validation — it just makes an unrealistic pair of numbers
  // obvious before submitting.
  const projection = useMemo(() => {
    const weekly = Number(form.weekly_minimum_hours)
    const required = Number(form.required_hours)
    if (!weekly || !required || !form.started_at || !form.expected_end_at) return null
    const start = new Date(form.started_at)
    const end = new Date(form.expected_end_at)
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null
    const weeks = Math.max(1, Math.round((end - start) / (7 * 24 * 3600 * 1000)))
    const projected = weeks * weekly
    return { weeks, projected, required, enough: projected >= required }
  }, [form.weekly_minimum_hours, form.required_hours, form.started_at, form.expected_end_at])

  function validateStep1() {
    const next = {}
    if (!form.full_name.trim()) next.full_name = 'Informe seu nome.'
    if (!form.email.trim()) next.email = 'Informe seu e-mail.'
    if (!form.registration_number.trim()) next.registration_number = 'Informe sua matrícula.'
    if (form.password.length < 8) next.password = 'Use pelo menos 8 caracteres.'
    if (form.password !== form.password_confirm) next.password_confirm = 'As senhas não conferem.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setTopError(null)

    const payload = {
      ...form,
      required_hours: Number(form.required_hours),
      weekly_minimum_hours: Number(form.weekly_minimum_hours),
      internship_id: form.internship_id || null,
      expected_end_at: form.expected_end_at || null,
    }

    try {
      await auth.register(payload)
      await login(form.email, form.password)
      navigate('/')
    } catch (err) {
      const { message, details } = apiError(err)
      setTopError(message)
      if (details && typeof details === 'object') {
        const flat = {}
        for (const [key, value] of Object.entries(details)) {
          flat[key] = Array.isArray(value) ? value[0] : String(value)
        }
        setErrors(flat)
        // Field errors from step 1 must not be hidden behind step 2.
        if (['email', 'registration_number', 'password'].some((k) => k in flat)) setStep(1)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white dark:bg-indigo-500">
            <Clock size={24} />
          </div>
          <h1 className="text-2xl font-bold">Criar conta</h1>
          <p className="text-sm muted">Etapa {step} de 2</p>
        </div>

        <div className="mb-4 flex gap-2">
          {[1, 2].map((n) => (
            <div
              key={n}
              className={`h-1.5 flex-1 rounded-full transition ${
                step >= n ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
          ))}
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {step === 1 && (
              <>
                <Field label="Nome completo" error={errors.full_name}>
                  <Input value={form.full_name} onChange={set('full_name')} required />
                </Field>
                <Field label="E-mail" error={errors.email}>
                  <Input type="email" value={form.email} onChange={set('email')} required />
                </Field>
                <Field label="Matrícula" error={errors.registration_number}>
                  <Input
                    value={form.registration_number}
                    onChange={set('registration_number')}
                    required
                  />
                </Field>
                <Field label="Senha" error={errors.password}>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={set('password')}
                    required
                  />
                  {form.password && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex flex-1 gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full ${
                              i < strength
                                ? strength <= 1
                                  ? 'bg-rose-500'
                                  : strength === 2
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                : 'bg-slate-200 dark:bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs muted">{STRENGTH_LABELS[strength]}</span>
                    </div>
                  )}
                </Field>
                <Field label="Confirme a senha" error={errors.password_confirm}>
                  <Input
                    type="password"
                    value={form.password_confirm}
                    onChange={set('password_confirm')}
                    required
                  />
                </Field>

                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={() => validateStep1() && setStep(2)}
                >
                  Continuar <ArrowRight size={16} />
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <Field label="Estágio" error={errors.internship_id}>
                  <Select value={form.internship_id} onChange={set('internship_id')}>
                    <option value="">Selecione (pode definir depois)</option>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title} — {option.organization}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Carga horária total" error={errors.required_hours}>
                    <Input
                      type="number"
                      min="1"
                      value={form.required_hours}
                      onChange={set('required_hours')}
                      required
                    />
                  </Field>
                  <Field label="Mínimo por semana" error={errors.weekly_minimum_hours}>
                    <Input
                      type="number"
                      min="1"
                      value={form.weekly_minimum_hours}
                      onChange={set('weekly_minimum_hours')}
                      required
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Início" error={errors.started_at}>
                    <Input type="date" value={form.started_at} onChange={set('started_at')} required />
                  </Field>
                  <Field label="Término previsto" error={errors.expected_end_at}>
                    <Input
                      type="date"
                      value={form.expected_end_at}
                      onChange={set('expected_end_at')}
                    />
                  </Field>
                </div>

                {projection && (
                  <p
                    className={`rounded-xl px-3 py-2 text-xs ${
                      projection.enough
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                    }`}
                  >
                    {form.weekly_minimum_hours}h/semana por {projection.weeks} semanas dá cerca de{' '}
                    {projection.projected}h — sua meta é {projection.required}h.
                    {!projection.enough && ' Talvez o prazo ou o mínimo semanal precise mudar.'}
                  </p>
                )}

                <p className="text-xs muted">
                  Toda sexta às 23:59 enviamos um e-mail se você não tiver batido o mínimo semanal.
                </p>

                {topError && (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                    {topError}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
                    <ArrowLeft size={16} />
                  </Button>
                  <Button type="submit" size="lg" loading={busy} className="flex-1">
                    Criar conta
                  </Button>
                </div>
              </>
            )}
          </form>
        </Card>

        <p className="mt-4 text-center text-sm muted">
          Já tem conta?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
