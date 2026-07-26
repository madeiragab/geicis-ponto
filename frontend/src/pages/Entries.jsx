import { useCallback, useEffect, useState } from 'react'
import { apiError } from '../api/client'
import { students as studentsApi, timeEntries } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import EntryRow from '../components/EntryRow'
import { Button, Card, CardTitle, Field, Input, Modal, Select, Skeleton, useToast } from '../components/ui'

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Entries() {
  const { isStudent, isProfessor, isCoordinator } = useAuth()
  const { push } = useToast()
  const [entries, setEntries] = useState([])
  const [studentList, setStudentList] = useState([])
  const [filters, setFilters] = useState({ student: '', from: '', to: '' })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({ check_in: '', check_out: '', adjustment_reason: '' })
  const [saving, setSaving] = useState(false)

  const canAdjust = isProfessor || isCoordinator

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await timeEntries.list({
        student: filters.student || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      })
      setEntries(data.results ?? [])
    } catch (err) {
      push(apiError(err).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [filters, push])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (isStudent) return
    studentsApi
      .list()
      .then(({ data }) => setStudentList(data.results ?? []))
      .catch(() => setStudentList([]))
  }, [isStudent])

  function openAdjust(entry) {
    setEditing(entry)
    setDraft({
      check_in: toLocalInput(entry.check_in),
      check_out: toLocalInput(entry.check_out),
      adjustment_reason: '',
    })
  }

  async function saveAdjust(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = { adjustment_reason: draft.adjustment_reason }
      if (draft.check_in) payload.check_in = new Date(draft.check_in).toISOString()
      if (draft.check_out) payload.check_out = new Date(draft.check_out).toISOString()
      await timeEntries.adjust(editing.id, payload)
      push('Registro ajustado.', 'success')
      setEditing(null)
      load()
    } catch (err) {
      push(apiError(err).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Registros de ponto</h1>

      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          {!isStudent && (
            <Field label="Aluno">
              <Select
                value={filters.student}
                onChange={(e) => setFilters((f) => ({ ...f, student: e.target.value }))}
              >
                <option value="">Todos</option>
                {studentList.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.user.full_name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="De">
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </Field>
          <Field label="Até">
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>{entries.length} registro(s)</CardTitle>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm muted">Nenhum registro no período.</p>
        ) : (
          entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              showStudent={!isStudent}
              onAdjust={canAdjust ? openAdjust : undefined}
            />
          ))
        )}
      </Card>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Ajustar registro">
        <form onSubmit={saveAdjust} className="space-y-4">
          <p className="text-sm muted">{editing?.student_name}</p>
          <Field label="Entrada">
            <Input
              type="datetime-local"
              value={draft.check_in}
              onChange={(e) => setDraft((d) => ({ ...d, check_in: e.target.value }))}
            />
          </Field>
          <Field label="Saída">
            <Input
              type="datetime-local"
              value={draft.check_out}
              onChange={(e) => setDraft((d) => ({ ...d, check_out: e.target.value }))}
            />
          </Field>
          <Field
            label="Motivo do ajuste"
            hint="Obrigatório — fica registrado junto com quem ajustou."
          >
            <Input
              value={draft.adjustment_reason}
              onChange={(e) => setDraft((d) => ({ ...d, adjustment_reason: e.target.value }))}
              placeholder="Aluno esqueceu de bater a saída"
              required
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={saving}
              disabled={!draft.adjustment_reason.trim()}
              className="flex-1"
            >
              Salvar ajuste
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
