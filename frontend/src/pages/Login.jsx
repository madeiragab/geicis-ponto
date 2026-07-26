import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { apiError } from '../api/client'
import { Button, Card, Field, Input } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white dark:bg-indigo-500">
            <Clock size={24} />
          </div>
          <h1 className="text-2xl font-bold">GEICIS Ponto</h1>
          <p className="text-sm muted">Controle de horas de estágio</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="E-mail">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@geicis.br"
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Senha">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </Field>

            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={busy} className="w-full">
              Entrar
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm muted">
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  )
}
