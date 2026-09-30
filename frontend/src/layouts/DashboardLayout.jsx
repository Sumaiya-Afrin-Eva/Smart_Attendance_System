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
  teacher: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  student: 'bg-teal-50 text-teal-800 border-teal-200/80',
  admin: 'bg-purple-50 text-purple-800 border-purple-200/80',
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
    sm: 'h-9 w-9 text-xs',
    md: 'h-10.5 w-10.5 text-sm',
    lg: 'h-12 w-12 text-base',
  }

  if (user?.picture) {
    return (
      <div className="relative">
        <img
          src={user.picture}
          alt={user.name || 'User avatar'}
          referrerPolicy="no-referrer"
          className={`${sizeClasses[size]} rounded-xl object-cover ring-2 ring-emerald-600/20 shadow-2xs`}
        />
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
      </div>
    )
  }
  return (
    <div className="relative">
      <div className={`flex ${sizeClasses[size]} items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-800 to-teal-700 font-bold text-white shadow-2xs`}>
        {getInitials(user?.name)}
      </div>
      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
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
    <div className="flex h-screen overflow-hidden bg-[#faf9f5] bg-warm-mesh text-stone-900">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-xs transition-opacity lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Modern Light Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#e7e5e0] bg-white transition-all duration-300 lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'
          } ${collapsed ? 'w-20' : 'w-68'}`}
      >
        {/* Header Branding */}
        <div className={`flex h-18 items-center border-b border-[#f0eee6] px-5 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3.5 overflow-hidden">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-50 text-emerald-800 shadow-2xs">
              <GraduationCap size={24} />
            </div>
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <p className="font-display truncate text-base font-bold tracking-tight text-stone-900">Smart Attendance</p>
                <p className="truncate text-xs font-medium text-stone-500">KUET CSE Portal</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 lg:hidden cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quick collapse toggle (Desktop) */}
        <div className="hidden px-4 pt-3 lg:flex justify-end">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-6.5 w-6.5 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-500 transition hover:border-stone-300 hover:bg-stone-100 hover:text-stone-800 cursor-pointer"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Section Label */}
        {!collapsed && (
          <div className="px-5 pt-3 pb-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Navigation</p>
          </div>
        )}

        {/* Nav Links */}
        <nav aria-label="Main navigation" className="mt-1 flex-1 space-y-1.5 px-3.5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm font-semibold transition-all duration-150 ${isActive
                  ? 'bg-emerald-50 text-emerald-950 border border-emerald-200/90 shadow-2xs font-bold'
                  : 'text-stone-600 hover:bg-stone-100/70 hover:text-stone-900 border border-transparent'
                } ${collapsed ? 'justify-center px-2' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${isActive ? 'bg-emerald-800 text-white shadow-2xs' : 'text-stone-500 group-hover:text-stone-800'
                      }`}
                  >
                    <Icon size={18} />
                  </div>
                  {!collapsed && (
                    <span className="truncate">{label}</span>
                  )}
                  {isActive && !collapsed && (
                    <span className="ml-auto h-2 w-2 rounded-full bg-emerald-600" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Telemetry Card */}
        {!collapsed && (
          <div className="mx-3.5 mb-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-stone-700 font-medium">
                <Wifi size={13} className="text-emerald-700" /> Face Biometrics Node
              </span>
              <span className="font-bold text-emerald-800">Online</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-stone-500">
              <span>Edge Sync Protocol</span>
              <span className="font-mono text-emerald-800 font-semibold">Active</span>
            </div>
          </div>
        )}

        {/* User Info & Logout */}
        <div className="border-t border-[#f0eee6] p-3.5">
          {!collapsed ? (
            <div className="mb-2.5 flex items-center gap-3 rounded-xl bg-stone-50/80 p-3 border border-stone-200/80">
              <Avatar user={user} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-stone-900">{user?.name}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${ROLE_BADGE[user?.role]}`}>
                    {user?.role}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-2.5 flex justify-center">
              <Avatar user={user} size="sm" />
            </div>
          )}

          <button
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-stone-600 transition-all hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 border border-transparent cursor-pointer ${collapsed ? 'justify-center px-2' : ''
              }`}
          >
            <LogOut size={17} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Sticky Frosted Header */}
        <header className="sticky top-0 z-30 flex h-18 shrink-0 items-center justify-between gap-4 border-b border-[#e7e5e0] bg-white/90 px-5 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-2xs hover:bg-stone-50 lg:hidden cursor-pointer"
            >
              <Menu size={20} />
            </button>

            <div>
              <h1 className="font-display text-lg font-bold tracking-tight text-stone-900 lg:text-xl">
                {pageTitle}
              </h1>
            </div>
          </div>

          {/* Right Header Badges */}
          <div className="flex items-center gap-3.5">
            {/* Campus Clock */}
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4 py-1.5 text-xs text-stone-700 shadow-2xs">
              <Clock size={14} className="text-emerald-700" />
              <span className="font-semibold">{currentDateStr}</span>
            </div>

            {/* Notification Bell */}
            <button
              aria-label="System notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-2xs transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 cursor-pointer"
            >
              <Bell size={18} />
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-emerald-600 ring-2 ring-white" />
            </button>

            <div className="hidden sm:block h-7 w-px bg-stone-200" aria-hidden="true" />

            {/* User Profile Info */}
            <div className="flex items-center gap-3 pl-1">
              <Avatar user={user} size="sm" />
              <div className="hidden leading-tight md:block">
                <p className="text-sm font-semibold text-stone-900">{user?.name}</p>
                <p className="text-xs text-stone-500 capitalize">{ROLE_LABEL[user?.role] || user?.role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Main Content */}
        <main className="flex-1 overflow-y-auto p-5 sm:p-7 lg:p-9">
          <div className="mx-auto max-w-6xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}