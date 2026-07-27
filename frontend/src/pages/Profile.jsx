import { useRef, useState } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { apiError } from '../api/client'
import { auth } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { Avatar } from '../components/Ranking'
import { Button, Card, CardTitle, Field, Input, useToast } from '../components/ui'

const MAX_MB = 5

function PasswordForm() {
  const { push } = useToast()
  const [form, setForm] = useState({ current_password: '', new_password: '', new_password_confirm: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      await auth.changePassword(form)
      push('Senha alterada com sucesso.', 'success')
      setForm({ current_password: '', new_password: '', new_password_confirm: '' })
    } catch (err) {
      const { message, details } = apiError(err)
      const flat = {}
      if (details && typeof details === 'object') {
        for (const [key, value] of Object.entries(details)) {
          flat[key] = Array.isArray(value) ? value[0] : String(value)
        }
      }
      setErrors(flat)
      if (Object.keys(flat).length === 0) push(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardTitle>Mudar senha</CardTitle>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Senha atual" error={errors.current_password}>
          <Input
            type="password"
            value={form.current_password}
            onChange={set('current_password')}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="Nova senha" error={errors.new_password}>
          <Input
            type="password"
            value={form.new_password}
            onChange={set('new_password')}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Confirme a nova senha" error={errors.new_password_confirm}>
          <Input
            type="password"
            value={form.new_password_confirm}
            onChange={set('new_password_confirm')}
            autoComplete="new-password"
            required
          />
        </Field>
        <Button type="submit" loading={busy}>
          Salvar nova senha
        </Button>
      </form>
    </Card>
  )
}

function AvatarCard() {
  const { user, refreshProfile } = useAuth()
  const { push } = useToast()
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  function pick() {
    inputRef.current?.click()
  }

  async function onFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > MAX_MB * 1024 * 1024) {
      push(`A imagem precisa ter até ${MAX_MB}MB.`, 'error')
      return
    }

    setPreview(URL.createObjectURL(file))
    setBusy(true)
    try {
      await auth.uploadAvatar(file)
      await refreshProfile()
      push('Foto atualizada.', 'success')
    } catch (err) {
      push(apiError(err).message, 'error')
    } finally {
      setBusy(false)
      setPreview(null)
    }
  }

  async function removeAvatar() {
    setBusy(true)
    try {
      await auth.removeAvatar()
      await refreshProfile()
      push('Foto removida — voltou para a foto padrão.', 'success')
    } catch (err) {
      push(apiError(err).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col items-center gap-4 text-center">
      <Avatar src={preview || user?.avatar_url} name={user?.full_name} size={96} />
      <div>
        <p className="font-semibold">{user?.full_name}</p>
        <p className="text-sm muted">{user?.email}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={pick} loading={busy}>
          <Upload size={14} /> Trocar foto
        </Button>
        <Button size="sm" variant="ghost" onClick={removeAvatar} disabled={busy}>
          <Trash2 size={14} /> Usar padrão
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
      <p className="text-xs muted">JPG, PNG ou GIF, até {MAX_MB}MB.</p>
    </Card>
  )
}

export default function Profile() {
  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-xl font-bold">Meu perfil</h1>
      <AvatarCard />
      <PasswordForm />
    </div>
  )
}
