import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { apiError, fieldErrors } from '../api/client'
import { internships as internshipsApi } from '../api/endpoints'
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
  Textarea,
  useToast,
} from './ui'

const EMPTY = {
  title: '',
  organization: '',
  description: '',
  supervisor_name: '',
  supervisor_email: '',
  is_active: true,
}

/**
 * The coordination's CRUD over placements. Creating was already possible;
 * editing and removing were only reachable through the Django admin.
 */
export default function InternshipsCard({ onChanged }) {
  const { push } = useToast()
  const [list, setList] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // `editing` doubles as the modal's open flag: null is closed, an object with
  // no id is a creation, an object with an id is an edit.
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const [deleting, setDeleting] = useState(null)
  const [removing, setRemoving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data } = await internshipsApi.list()
      setList(data.results ?? [])
      setCount(data.count ?? (data.results ?? []).length)
    } catch (err) {
      push(apiError(err).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setDraft(EMPTY)
    setErrors({})
    setEditing({})
  }

  function openEdit(internship) {
    setDraft({
      title: internship.title ?? '',
      organization: internship.organization ?? '',
      description: internship.description ?? '',
      supervisor_name: internship.supervisor_name ?? '',
      supervisor_email: internship.supervisor_email ?? '',
      is_active: internship.is_active,
    })
    setErrors({})
    setEditing(internship)
  }

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      if (editing.id) {
        await internshipsApi.update(editing.id, draft)
        push('Estágio atualizado.', 'success')
      } else {
        await internshipsApi.create(draft)
        push('Estágio criado.', 'success')
      }
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

  async function confirmDelete() {
    setRemoving(true)
    try {
      await internshipsApi.remove(deleting.id)
      push('Estágio excluído.', 'success')
      setDeleting(null)
      await load()
      onChanged?.()
    } catch (err) {
      // A placement with students is PROTECTed at the database level and comes
      // back as a 409, not a crash. The message already says what to do.
      push(apiError(err).message, 'error')
      setDeleting(null)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <CardTitle className="mb-0">Estágios</CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} /> Novo estágio
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {list.map((internship) => (
            <div
              key={internship.id}
              className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{internship.title}</p>
                <p className="truncate text-xs muted">
                  {internship.organization}
                  {internship.supervisor_name && ` · ${internship.supervisor_name}`}
                </p>
              </div>
              <Badge tone={internship.is_active ? 'running' : 'neutral'}>
                {internship.is_active ? 'ativo' : 'inativo'}
              </Badge>
              <span className="tabular w-16 text-right text-xs muted">
                {internship.student_count} aluno(s)
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openEdit(internship)}
                aria-label={`Editar ${internship.title}`}
                title="Editar"
              >
                <Pencil size={14} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleting(internship)}
                aria-label={`Excluir ${internship.title}`}
                title="Excluir"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          {list.length === 0 && (
            <p className="py-4 text-center text-sm muted">Nenhum estágio cadastrado.</p>
          )}
          {count > list.length && (
            <p className="pt-2 text-center text-xs muted">
              Mostrando {list.length} de {count}.
            </p>
          )}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar estágio' : 'Novo estágio'}
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Título" error={errors.title}>
            <Input
              value={draft.title}
              onChange={set('title')}
              placeholder="Infraestrutura de Redes"
              required
            />
          </Field>
          <Field label="Instituição" error={errors.organization}>
            <Input
              value={draft.organization}
              onChange={set('organization')}
              placeholder="TRE-PE"
              required
            />
          </Field>
          <Field label="Descrição" error={errors.description}>
            <Textarea
              value={draft.description}
              onChange={set('description')}
              placeholder="O que os alunos fazem nesse estágio."
            />
          </Field>
          <Field label="Supervisor" error={errors.supervisor_name}>
            <Input value={draft.supervisor_name} onChange={set('supervisor_name')} />
          </Field>
          <Field label="E-mail do supervisor" error={errors.supervisor_email}>
            <Input type="email" value={draft.supervisor_email} onChange={set('supervisor_email')} />
          </Field>
          <Field
            label="Situação"
            error={errors.is_active}
            hint="Um estágio inativo continua no histórico, mas sai da lista de escolha no cadastro."
          >
            <Select
              value={draft.is_active ? 'true' : 'false'}
              onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.value === 'true' }))}
            >
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </Select>
          </Field>

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
              {editing?.id ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Excluir estágio">
        <p className="text-sm">
          Excluir <strong>{deleting?.title}</strong> de {deleting?.organization}? Não dá para
          desfazer.
        </p>
        {deleting?.student_count > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Esse estágio tem {deleting.student_count} aluno(s) vinculado(s). A exclusão vai ser
            recusada — mova os alunos ou apenas marque o estágio como inativo.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleting(null)}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button variant="danger" loading={removing} onClick={confirmDelete} className="flex-1">
            Excluir
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
