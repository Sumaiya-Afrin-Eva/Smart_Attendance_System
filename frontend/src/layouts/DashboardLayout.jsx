import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, BookOpen, ClipboardCheck, FileText, GraduationCap, LayoutDashboard,
  LogOut, Menu, Radio, ScanFace, Settings, ShieldAlert, Users, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export const NAV = {
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/teacher/courses', label: 'Courses & Classes', icon: BookOpen },
    { to: '/teacher/live', label: 'Live Roster', icon: Radio },
    { to: '/teacher/reports', label: 'Reports', icon: FileText },
  ],
  student: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/student/attendance', label: 'My Attendance', icon: ClipboardCheck },
    { to: '/student/courses', label: 'Courses', icon: BookOpen },
    { to: '/student/face', label: 'Face Enrollment', icon: ScanFace },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'User Management', icon: Users },
    { to: '/admin/alerts', label: 'Security Alerts', icon: ShieldAlert },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ],
}

const ROLE_LABEL = { teacher: 'Teacher', student: 'Student', admin: 'Admin' }

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

// Shows the Google profile picture when available, otherwise the user's initials
function Avatar({ user }) {
  if (user.picture) {
    return (
      <img
        src={user.picture}
        alt=""
        referrerPolicy="no-referrer"
        className="h-9 w-9 rounded-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white">
      {getInitials(user.name)}
    </div>
  )
}

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false) // mobile sidebar drawer

  const pageTitle = NAV[user.role].find((item) => item.to === pathname)?.label ?? 'Dashboard'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Backdrop for the mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-900 text-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand">
              <GraduationCap size={20} />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Smart Attendance</p>
              <p className="text-xs text-slate-400">KUET, CSE3200</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded p-1 text-slate-400 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav aria-label="Main navigation" className="mt-4 flex-1 space-y-1 px-3">
          {NAV[user.role].map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-brand" />
                  )}
                  <Icon size={18} className={isActive ? 'text-brand' : ''} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main column: top bar + page content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-8">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <Menu size={22} />
          </button>

          <h1 className="text-lg font-semibold text-navy-900">{pageTitle}</h1>

          <div className="ml-auto flex items-center gap-4">
            {/* Placeholder: will show real notifications later */}
            <button
              aria-label="Notifications"
              className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <Bell size={20} />
            </button>

            <div className="h-6 w-px bg-slate-200" aria-hidden="true" />

            <div className="flex items-center gap-3">
              <Avatar user={user} />
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-medium text-navy-900">{user.name}</p>
                <p className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}