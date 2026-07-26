import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, Mail, PlayCircle, Users } from 'lucide-react'
import { apiError } from '../api/client'
import { dashboard, internships as internshipsApi, weeklyAlerts } from '../api/endpoints'
import StatCard from '../components/StatCard'
import { RankingTable } from '../components/Ranking'
import { Badge, Button, Card, CardTitle, Field, Input, Modal, Skeleton, useToast } from '../components/ui'

export default function AdminPanel() {
  const { push } = useToast()
  const [data, setData] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ title: '', organization: '', supervisor_name: '', supervisor_email: '' })
  const [saving, setSaving] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      const [dashRes, alertRes, listRes] = await Promise.all([
        dashboard.get(),
        weeklyAlerts.list(),
        internshipsApi.list(),
      ])
      setData(dashRes.data)
      setAlerts(alertRes.data.results ?? [])
      setList(listRes.data.results ?? [])
    } catch (err) {
      push(apiError(err).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createInternship(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await internshipsApi.create(draft)
      push('Estágio criado.', 'success')
      setCreating(false)
      setDraft({ title: '', organization: '', supervisor_name: '', supervisor_email: '' })
      loadAll()
    } catch (err) {
      push(apiError(err).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }

  const byStatus = data?.students_by_status ?? {}
  const failedAlerts = alerts.filter((a) => a.delivery_status === 'FAILED')

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Coordenação</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Alunos ativos"
          value={byStatus.ACTIVE ?? 0}
          sub={`${Object.values(byStatus).reduce((a, b) => a + b, 0)} no total`}
          icon={Users}
          tone="primary"
        />
        <StatCard
          label="Horas do grupo"
          value={`${Number(data?.total_hours_logged ?? 0).toFixed(0)}h`}
          icon={Clock}
        />
        <StatCard
          label="Batendo ponto agora"
          value={data?.clocked_in_now?.length ?? 0}
          icon={PlayCircle}
          tone="running"
        />
        <StatCard
          label="Abaixo do mínimo"
          value={data?.below_weekly_minimum?.length ?? 0}
          sub="nesta semana"
          icon={AlertTriangle}
          tone="warning"
        />
      </div>

      {data?.clocked_in_now?.length > 0 && (
        <Card>
          <CardTitle>Com ponto aberto agora</CardTitle>
          <div className="space-y-2">
            {data.clocked_in_now.map((row) => (
              <div key={row.student_id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{row.full_name}</span>
                <span className="tabular muted">
                  desde{' '}
                  {new Date(row.since).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {row.is_stale && <Badge tone="danger">esquecido</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {data?.below_weekly_minimum?.length > 0 && (
        <Card>
          <CardTitle>Abaixo do mínimo semanal</CardTitle>
          <div className="space-y-2">
            {data.below_weekly_minimum.map((row) => (
              <div key={row.student_id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{row.full_name}</span>
                <span className="tabular muted">
                  {Number(row.hours).toFixed(1)}h de {row.minimum}h
                </span>
                <Badge tone="warning">
                  faltam {Math.max(0, row.minimum - Number(row.hours)).toFixed(1)}h
                </Badge>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs muted">
            O e-mail sai automaticamente na sexta às 23:59 para quem ainda estiver nesta lista.
          </p>
        </Card>
      )}

      <Card>
        <CardTitle>Top 5</CardTitle>
        <RankingTable rows={data?.top_five ?? []} />
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <CardTitle className="mb-0">Estágios</CardTitle>
          <Button size="sm" onClick={() => setCreating(true)}>
            Novo estágio
          </Button>
        </div>
        <div className="space-y-2">
          {list.map((internship) => (
            <div key={internship.id} className="flex items-center gap-2 text-sm">
              <div className="flex-1">
                <p className="font-medium">{internship.title}</p>
                <p className="text-xs muted">{internship.organization}</p>
              </div>
              <Badge tone={internship.is_active ? 'running' : 'neutral'}>
                {internship.is_active ? 'ativo' : 'inativo'}
              </Badge>
              <span className="tabular w-16 text-right text-xs muted">
                {internship.student_count} aluno(s)
              </span>
            </div>
          ))}
          {list.length === 0 && (
            <p className="py-4 text-center text-sm muted">Nenhum estágio cadastrado.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>
          Alertas semanais
          {failedAlerts.length > 0 && (
            <Badge tone="danger" className="ml-2">
              {failedAlerts.length} falha(s)
            </Badge>
          )}
        </CardTitle>
        {alerts.length === 0 ? (
          <p className="py-4 text-center text-sm muted">Nenhum alerta enviado ainda.</p>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 15).map((alert) => (
              <div key={alert.id} className="flex items-center gap-2 text-sm">
                <Mail size={14} className="muted" />
                <span className="flex-1 truncate">{alert.student.full_name}</span>
                <span className="tabular text-xs muted">
                  {new Date(`${alert.week_start}T00:00:00`).toLocaleDateString('pt-BR')}
                </span>
                <span className="tabular text-xs muted">
                  {Number(alert.hours_logged).toFixed(1)}/{Number(alert.minimum_required).toFixed(0)}h
                </span>
                <Badge tone={alert.delivery_status === 'SENT' ? 'running' : 'danger'}>
                  {alert.delivery_status === 'SENT' ? 'enviado' : 'falhou'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="Novo estágio">
        <form onSubmit={createInternship} className="space-y-4">
          <Field label="Título">
            <Input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Infraestrutura de Redes"
              required
            />
          </Field>
          <Field label="Instituição">
            <Input
              value={draft.organization}
              onChange={(e) => setDraft((d) => ({ ...d, organization: e.target.value }))}
              placeholder="TRE-PE"
              required
            />
          </Field>
          <Field label="Supervisor">
            <Input
              value={draft.supervisor_name}
              onChange={(e) => setDraft((d) => ({ ...d, supervisor_name: e.target.value }))}
            />
          </Field>
          <Field label="E-mail do supervisor">
            <Input
              type="email"
              value={draft.supervisor_email}
              onChange={(e) => setDraft((d) => ({ ...d, supervisor_email: e.target.value }))}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setCreating(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" loading={saving} className="flex-1">
              Criar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
