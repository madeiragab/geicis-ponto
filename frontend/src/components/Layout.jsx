import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Clock, LayoutDashboard, ListChecks, LogOut, Moon, Settings, Sun, Trophy } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../hooks/useTheme'
import { cn } from './ui'
import { Avatar } from './Ranking'

function NavItem({ to, icon: Icon, children }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition',
          isActive
            ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
            : 'muted hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white',
        )
      }
    >
      <Icon size={16} />
      <span className="hidden sm:inline">{children}</span>
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout, isCoordinator } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <div className="mr-auto flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white dark:bg-indigo-500">
              <Clock size={18} />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold">GEICIS Ponto</p>
              <p className="hidden text-[10px] muted sm:block">
                Infraestrutura Computacional e Impacto Social
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            <NavItem to="/" icon={LayoutDashboard}>
              Início
            </NavItem>
            <NavItem to="/ranking" icon={Trophy}>
              Ranking
            </NavItem>
            <NavItem to="/registros" icon={ListChecks}>
              Registros
            </NavItem>
            {isCoordinator && (
              <NavItem to="/coordenacao" icon={Settings}>
                Coordenação
              </NavItem>
            )}
          </nav>

          <button
            onClick={toggle}
            className="ml-1 rounded-xl p-2 muted transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <NavLink to="/perfil" title={user?.full_name} className="ml-1 shrink-0">
            <Avatar src={user?.avatar_url} name={user?.full_name} size={28} />
          </NavLink>

          <button
            onClick={handleLogout}
            className="rounded-xl p-2 muted transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
            title={`Sair (${user?.full_name})`}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">
        <Outlet />
      </main>
    </div>
  )
}
