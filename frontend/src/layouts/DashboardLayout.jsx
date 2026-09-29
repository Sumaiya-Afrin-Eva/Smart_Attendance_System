import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, BookOpen, ChevronLeft, ChevronRight, ClipboardCheck, FileText,
  GraduationCap, LayoutDashboard, LogOut, Menu, Radio, Settings,
  ShieldAlert, UserRound, Users, X, Clock, Wifi,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export const NAV = {
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/teacher/courses', label: 'Courses & Classes', icon: BookOpen },
    { to: '/teacher/live', label: 'Live Roster', icon: Radio },
    { to: '/teacher/reports', label: 'Reports & Export', icon: FileText },
  ],
  student: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/student/attendance', label: 'My Attendance', icon: ClipboardCheck },
    { to: '/student/courses', label: 'My Courses', icon: BookOpen },
    { to: '/student/profile', label: 'Academic Profile', icon: UserRound },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'User Directory', icon: Users },
    { to: '/admin/alerts', label: 'Security & Spoofs', icon: ShieldAlert },
    { to: '/admin/settings', label: 'System Settings', icon: Settings },
  ],
}

const ROLE_LABEL = { teacher: 'Faculty Member', student: 'Undergraduate Student', admin: 'System Administrator' }
const ROLE_BADGE = {
  teacher: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  student: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  admin: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
}

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

function Avatar({ user, size = 'md' }) {
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-9 w-9 text-xs',
    lg: 'h-11 w-11 text-sm',
  }

  if (user?.picture) {
    return (
      <div className="relative">
        <img
          src={user.picture}
          alt={user.name || 'User avatar'}
          referrerPolicy="no-referrer"
          className={`${sizeClasses[size]} rounded-xl object-cover ring-2 ring-white/10 shadow-xs`}
        />
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-teal-400 ring-2 ring-[#0f172a]" />
      </div>
    )
  }
  return (
    <div className="relative">
      <div className={`flex ${sizeClasses[size]} items-center justify-center rounded-xl bg-gradient-to-tr from-teal-800 to-teal-600 font-bold text-white shadow-xs`}>
        {getInitials(user?.name)}
      </div>
      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-teal-400 ring-2 ring-[#0f172a]" />
    </div>
  )
}

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const navItems = NAV[user?.role] || []
  const activeItem = navItems.find((item) => item.to === pathname)
  const pageTitle = activeItem?.label ?? 'Dashboard'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const currentDateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs transition-opacity lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar with soothing oceanic dark tone */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800/80 bg-[#0f172a] text-white transition-all duration-300 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-20' : 'w-64'}`}
      >
        {/* Header Branding */}
        <div className={`flex h-16 items-center border-b border-slate-800/80 px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-950/80 text-teal-300 shadow-xs">
              <GraduationCap size={22} />
            </div>
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <p className="font-display truncate text-sm font-bold tracking-tight text-white">Smart Attendance</p>
                <p className="truncate text-[11px] font-medium text-slate-400">KUET CSE Portal</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick collapse button (Desktop) */}
        <div className="hidden px-3 pt-3 lg:flex justify-end">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>

        {/* Section Label */}
        {!collapsed && (
          <div className="px-5 pt-3 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Navigation</p>
          </div>
        )}

        {/* Nav Links */}
        <nav aria-label="Main navigation" className="mt-1 flex-1 space-y-1.5 px-3">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-teal-500/15 text-teal-200 border border-teal-500/30 shadow-2xs'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                } ${collapsed ? 'justify-center px-2' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      isActive ? 'bg-teal-700 text-white shadow-2xs' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  {!collapsed && (
                    <span className="truncate text-xs">{label}</span>
                  )}
                  {isActive && !collapsed && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-400" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* System telemetry widget on desktop sidebar */}
        {!collapsed && (
          <div className="mx-3 mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Wifi size={12} className="text-teal-400" /> Face Recognition Node
              </span>
              <span className="font-semibold text-teal-400">Online</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
              <span>Sync Protocol</span>
              <span>LAN Live</span>
            </div>
          </div>
        )}

        {/* Bottom: user profile card + logout */}
        <div className="border-t border-slate-800/80 p-3">
          {!collapsed ? (
            <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.03] p-2.5 border border-white/[0.05]">
              <Avatar user={user} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{user?.name}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider border ${ROLE_BADGE[user?.role]}`}>
                    {user?.role}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-2 flex justify-center">
              <Avatar user={user} size="sm" />
            </div>
          )}

          <button
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 transition-all hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/20 border border-transparent cursor-pointer ${
              collapsed ? 'justify-center px-2' : ''
            }`}
          >
            <LogOut size={16} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 lg:hidden cursor-pointer"
            >
              <Menu size={18} />
            </button>

            <div>
              <h1 className="font-display text-base font-bold tracking-tight text-slate-800 lg:text-lg">
                {pageTitle}
              </h1>
            </div>
          </div>

          {/* Right Header Badges */}
          <div className="flex items-center gap-3">
            {/* Live Campus network status chip */}
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 shadow-2xs">
              <Clock size={13} className="text-slate-400" />
              <span className="font-medium text-slate-700">{currentDateStr}</span>
            </div>

            {/* Notification bell */}
            <button
              aria-label="System notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
            >
              <Bell size={17} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-teal-600 ring-2 ring-white" />
            </button>

            <div className="hidden sm:block h-6 w-px bg-slate-200" aria-hidden="true" />

            {/* User badge */}
            <div className="flex items-center gap-2.5 pl-1">
              <Avatar user={user} size="sm" />
              <div className="hidden leading-tight md:block">
                <p className="text-xs font-semibold text-slate-800">{user?.name}</p>
                <p className="text-[11px] text-slate-500 capitalize">{ROLE_LABEL[user?.role] || user?.role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}