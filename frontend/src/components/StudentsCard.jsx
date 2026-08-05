import { useEffect, useState } from 'react'
import { Pencil, Search } from 'lucide-react'
import { apiError, fieldErrors } from '../api/client'
import { internships as internshipsApi, students as studentsApi } from '../api/endpoints'
import { Avatar } from './Ranking'
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  useToast,
} from './ui'

const STATUS_LABELS = {
  ACTIVE: 'Ativo',
  COMPLETED: 'Concluído',
  SUSPENDED: 'Suspenso',
  WITHDRAWN: 'Desligado',
}

const STATUS_TONES = {
  ACTIVE: 'running',
  COMPLETED: 'primary',
  SUSPENDED: 'warning',
  WITHDRAWN: 'neutral',
}

/**
 * Where the coordination moves a student between placements and sets the hour
 * targets. The API refuses these fields for anyone who is not a coordinator,
 * so this card is only mounted on the coordination screen.
 */
export default function StudentsCard({ onChanged }) {
  const { push } = useToast()
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const [options, setOptions] = useState([])
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data } = await studentsApi.list({ search: query || undefined, page })
      setRows(data.results ?? [])
      setCount(data.count ?? 0)
      setHasNext(Boolean(data.next))
    } catch (err) {
      push(apiError(err).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page])

  useEffect(() => {
    // The unpaginated variant: the select needs every placement, including the
    // inactive one a student may still be attached to.
    internshipsApi
      .minimal()
      .then(({ data }) => setOptions(data ?? []))
      .catch((err) => push(apiError(err).message, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submitSearch(event) {
    event.preventDefault()
    setPage(1)
    setQuery(search.trim())
  }

  function openEdit(student) {
    setDraft({
      internship_id: student.internship?.id ? String(student.internship.id) : '',
      required_hours: String(student.required_hours ?? ''),
      weekly_minimum_hours: String(student.weekly_minimum_hours ?? ''),
      status: student.status,
      started_at: student.started_at ?? '',
      expected_end_at: student.expected_end_at ?? '',
    })
    setErrors({})
    setEditing(student)
  }

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      await studentsApi.update(editing.id, {
        // An empty select means "no placement yet", which the serializer
        // accepts as null — sending '' would fail primary-key validation.
        internship_id: draft.internship_id === '' ? null : Number(draft.internship_id),
        required_hours: Number(draft.required_hours),
        weekly_minimum_hours: Number(draft.weekly_minimum_hours),
        status: draft.status,
        started_at: draft.started_at,
        expected_end_at: draft.expected_end_at === '' ? null : draft.expected_end_at,
      })
      push('Aluno atualizado.', 'success')
      setEditing(null)
      await load()
      onChanged?.()
    } catch (err) {
      const flat = fieldErrors(err)
      setErrors(flat)
      if (Object.keys(flat).length === 0) push(apiError(err).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="mb-0">Alunos</CardTitle>
        <form onSubmit={submitSearch} className="flex flex-1 justify-end gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, e-mail ou matrícula"
            className="max-w-xs py-1.5 text-sm"
          />
          <Button size="sm" variant="outline" type="submit">
            <Search size={14} />
          </Button>
        </form>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((student) => (
            <div
              key={student.id}
              className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <Avatar src={student.user?.avatar_url} name={student.user?.full_name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{student.user?.full_name}</p>
                <p className="truncate text-xs muted">
                  {student.internship
                    ? `${student.internship.title} · ${student.internship.organization}`
                    : 'Sem estágio'}
                </p>
              </div>
              <span className="tabular hidden w-24 text-right text-xs muted sm:block">
                {Number(student.total_hours ?? 0).toFixed(0)}h de {student.required_hours}h
              </span>
              <Badge tone={STATUS_TONES[student.status] ?? 'neutral'}>
                {STATUS_LABELS[student.status] ?? student.status}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openEdit(student)}
                aria-label={`Editar ${student.user?.full_name}`}
                title="Editar"
              >
                <Pencil size={14} />
              </Button>
            </div>
          ))}

          {rows.length === 0 && (
            <p className="py-4 text-center text-sm muted">
              {query ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado.'}
            </p>
          )}

          {(page > 1 || hasNext) && (
            <div className="flex items-center justify-between pt-2 text-xs muted">
              <Button
                size="sm"
                variant="ghost"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span>
                Página {page} · {count} aluno(s)
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.user?.full_name ?? 'Editar aluno'}
      >
        {draft && (
          <form onSubmit={save} className="space-y-4">
            <p className="text-xs muted">
              Matrícula {editing.registration_number} · {editing.user?.email}
            </p>

            <Field label="Estágio" error={errors.internship_id}>
              <Select value={draft.internship_id} onChange={set('internship_id')}>
                <option value="">Sem estágio</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title} — {option.organization}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Carga horária total" error={errors.required_hours}>
                <Input
                  type="number"
                  min="1"
                  value={draft.required_hours}
                  onChange={set('required_hours')}
                  required
                />
              </Field>
              <Field label="Mínimo semanal" error={errors.weekly_minimum_hours}>
                <Input
                  type="number"
                  min="1"
                  value={draft.weekly_minimum_hours}
                  onChange={set('weekly_minimum_hours')}
                  required
                />
              </Field>
            </div>

            <Field label="Situação" error={errors.status}>
              <Select value={draft.status} onChange={set('status')}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Início" error={errors.started_at}>
                <Input
                  type="date"
                  value={draft.started_at}
                  onChange={set('started_at')}
                  required
                />
              </Field>
              <Field label="Término previsto" error={errors.expected_end_at}>
                <Input
                  type="date"
                  value={draft.expected_end_at}
                  onChange={set('expected_end_at')}
                />
              </Field>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" loading={saving} className="flex-1">
                Salvar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  )
}
