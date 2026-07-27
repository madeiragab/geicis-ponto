import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { apiError } from '../api/client'
import { internships as internshipsApi, ranking as rankingApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { RankingChart, RankingTable } from '../components/Ranking'
import { Card, CardTitle, Select, Skeleton, useToast } from '../components/ui'

export default function Ranking() {
  const { profile, isStudent } = useAuth()
  const { push } = useToast()
  const [rows, setRows] = useState([])
  const [options, setOptions] = useState([])
  const [internship, setInternship] = useState('')
  const [onlyActive, setOnlyActive] = useState('')
  const [loading, setLoading] = useState(true)

  const meId = isStudent ? profile?.id : null

  useEffect(() => {
    internshipsApi
      .minimal()
      .then(({ data }) => setOptions(data))
      .catch(() => setOptions([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    rankingApi
      .get({
        internship: internship || undefined,
        status: onlyActive || undefined,
      })
      .then(({ data }) => setRows(data.results))
      .catch((err) => push(apiError(err).message, 'error'))
      .finally(() => setLoading(false))
  }, [internship, onlyActive, push])

  const myRow = rows.find((row) => row.student_id === meId)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex items-center gap-2">
          <div className="rounded-xl bg-amber-100 p-2 dark:bg-amber-500/15">
            <Trophy size={20} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Ranking de horas</h1>
            <p className="text-xs muted">Ordenado por horas acumuladas</p>
          </div>
        </div>

        <Select
          value={internship}
          onChange={(e) => setInternship(e.target.value)}
          className="w-auto min-w-[10rem] text-sm"
        >
          <option value="">Todos os estágios</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </Select>

        <Select
          value={onlyActive}
          onChange={(e) => setOnlyActive(e.target.value)}
          className="w-auto text-sm"
        >
          <option value="">Todos</option>
          <option value="ACTIVE">Só ativos</option>
        </Select>
      </div>

      {loading ? (
        <>
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-48 w-full" />
        </>
      ) : (
        <>
          <Card>
            <CardTitle>Horas por aluno</CardTitle>
            <RankingChart rows={rows} meId={meId} />
          </Card>

          <Card>
            <CardTitle>Classificação completa</CardTitle>
            <RankingTable rows={rows} meId={meId} />
          </Card>
        </>
      )}

      {/* Your own line never scrolls out of reach. */}
      {myRow && !loading && (
        <div className="sticky bottom-4 z-30">
          <div className="card flex items-center gap-3 border-indigo-300 px-4 py-3 shadow-lg dark:border-indigo-500/40">
            <span className="tabular text-lg font-bold text-indigo-600 dark:text-indigo-400">
              {myRow.position}º
            </span>
            <span className="flex-1 truncate text-sm font-medium">{myRow.full_name}</span>
            <span className="tabular text-sm font-semibold">
              {Number(myRow.total_hours).toFixed(1)}h
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
