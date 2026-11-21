import { useEffect, useMemo, useState, useRef } from 'react'
import {
  BriefcaseBusiness,
  CheckCircle2,
  GraduationCap,
  ImagePlus,
  Lock,
  Mail,
  Plus,
  RotateCcw,
  Search,
  Filter,
  ShieldCheck,
  UserCog,
  UserRound,
  X,
  UploadCloud,
  Phone,
  Smartphone,
  BookOpen,
  ChevronDown,
  Check
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

const statusColors = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'On leave': 'bg-amber-50 text-amber-700 ring-amber-200',
  Pending: 'bg-sky-50 text-sky-700 ring-sky-200',
  Disabled: 'bg-rose-50 text-rose-700 ring-rose-200',
  Resigned: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const DEPARTMENTS = ["CSE", "EEE", "ECE", "ME", "CE", "IEM", "BME", "MSE", "URP", "ARCH", "BECM", "LE", "TE", "ChE", "MTE", "PHY", "CHEM", "MATH", "HUM"];

const RESEARCH_FIELDS = [
  "Artificial Intelligence", "Machine Learning", "Data Science", "Computer Vision",
  "Natural Language Processing", "Software Engineering", "Computer Networks",
  "Cybersecurity", "Database Systems", "Human-Computer Interaction",
  "Internet of Things (IoT)", "VLSI Design", "Power Systems",
  "Renewable Energy", "Robotics", "Bioinformatics", "Cloud Computing"
];

function SearchableDropdown({
  label = "All Research Areas",
  value,
  onChange,
  options = [],
  placeholder = "Search research area...",
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options
    const q = searchTerm.toLowerCase().trim()
    return options.filter(opt => opt.toLowerCase().includes(q))
  }, [options, searchTerm])

  const isSelected = value && value !== 'All'

  return (
    <div ref={dropdownRef} className={`relative flex-1 min-w-[185px] ${className}`}>
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen)
          if (!isOpen) setSearchTerm('')
        }}
        className={`h-9 w-full flex items-center justify-between rounded-xl border px-3 text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
          isSelected
            ? 'border-emerald-400 bg-emerald-50/70 text-emerald-900 font-bold'
            : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
        }`}
      >
        <span className="truncate pr-1 text-left">
          {isSelected ? value : label}
        </span>
        <div className="flex items-center gap-1 shrink-0 text-stone-400">
          {isSelected && (
            <span
              onClick={(e) => {
                e.stopPropagation()
                onChange('All')
              }}
              className="p-0.5 hover:text-stone-700 transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={`transition-transform duration-150 ${isOpen ? 'rotate-180 text-emerald-700' : ''}`} />
        </div>
      </button>

      {/* Popover Menu with search inside */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full min-w-[280px] max-w-sm rounded-xl border border-stone-200 bg-white p-2.5 shadow-xl animate-in fade-in zoom-in-95 duration-100">
          {/* Inner Search Input */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={placeholder}
              className="h-8 w-full rounded-lg border border-stone-200 bg-stone-50/80 pl-8 pr-7 text-xs font-medium text-stone-800 placeholder-stone-400 focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-2 p-0.5 text-stone-400 hover:text-stone-600 cursor-pointer"
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1 text-xs">
            {/* "All" reset option */}
            <button
              type="button"
              onClick={() => {
                onChange('All')
                setIsOpen(false)
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-between ${
                !isSelected
                  ? 'bg-emerald-50 text-emerald-800 font-bold'
                  : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              <span>{label}</span>
              {!isSelected && <Check size={12} className="text-emerald-700" />}
            </button>

            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-stone-400">
                No research areas matched "{searchTerm}"
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const active = value === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt)
                      setIsOpen(false)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                      active
                        ? 'bg-emerald-50 text-emerald-900 font-bold'
                        : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="truncate pr-2">{opt}</span>
                    {active && <Check size={12} className="text-emerald-700 shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FacultyFilterBar({
  sectionKey,
  sectionTitle,
  filterState,
  onUpdateFilter,
  onResetFilters,
  allDesignations,
  allResearchFields,
  allMemberships,
}) {
  const hasActiveFilter =
    Boolean(filterState.search.trim()) ||
    filterState.designation !== 'All' ||
    filterState.research !== 'All' ||
    filterState.membership !== 'All'

  return (
    <div className="mt-3.5 space-y-2.5 rounded-xl border border-stone-200/90 bg-stone-50/70 p-3.5">
      {/* Search Input on its own line - Long and prominent */}
      <div className="relative w-full">
        <Search className="absolute left-3.5 top-3 h-4 w-4 text-stone-400" />
        <input
          type="text"
          value={filterState.search}
          onChange={(e) => onUpdateFilter(sectionKey, 'search', e.target.value)}
          placeholder={`Search ${sectionTitle.toLowerCase()} by name, email, education, research, or phone...`}
          className="h-10 w-full rounded-xl border border-stone-200 bg-white pl-10 pr-9 text-sm font-medium text-stone-800 placeholder-stone-400 shadow-2xs focus:border-emerald-500 focus:outline-none transition-colors"
        />
        {filterState.search && (
          <button
            type="button"
            onClick={() => onUpdateFilter(sectionKey, 'search', '')}
            className="absolute right-3 top-2.5 p-0.5 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
            title="Clear search query"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Single & Group Filter Dropdowns */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-500 shrink-0">
          <Filter size={13} className="text-stone-400" />
          Filter by:
        </div>

        {/* Designation Filter */}
        <select
          value={filterState.designation}
          onChange={(e) => onUpdateFilter(sectionKey, 'designation', e.target.value)}
          className={`h-9 min-w-[145px] flex-1 rounded-xl border px-3 text-xs font-semibold shadow-2xs focus:border-emerald-500 focus:outline-none cursor-pointer transition-colors ${
            filterState.designation !== 'All'
              ? 'border-emerald-400 bg-emerald-50/60 text-emerald-900 font-bold'
              : 'border-stone-200 bg-white text-stone-700'
          }`}
        >
          <option value="All">All Designations</option>
          {allDesignations.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        {/* Searchable Research Area Filter */}
        <SearchableDropdown
          label="All Research Areas"
          value={filterState.research}
          onChange={(val) => onUpdateFilter(sectionKey, 'research', val)}
          options={allResearchFields}
          placeholder="Search research area..."
        />

        {/* Professional Body Filter */}
        <select
          value={filterState.membership}
          onChange={(e) => onUpdateFilter(sectionKey, 'membership', e.target.value)}
          className={`h-9 min-w-[170px] flex-1 rounded-xl border px-3 text-xs font-semibold shadow-2xs focus:border-emerald-500 focus:outline-none cursor-pointer transition-colors ${
            filterState.membership !== 'All'
              ? 'border-emerald-400 bg-emerald-50/60 text-emerald-900 font-bold'
              : 'border-stone-200 bg-white text-stone-700'
          }`}
        >
          <option value="All">All Professional Bodies</option>
          {allMemberships.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Reset button */}
        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => onResetFilters(sectionKey)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 shadow-2xs transition-colors cursor-pointer shrink-0"
            title={`Reset all filters for ${sectionTitle}`}
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>

      {/* Active Filter Chips / Tags (Allows removing single filter from group) */}
      {hasActiveFilter && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Active:</span>
          {filterState.search.trim() && (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-200/80 px-2.5 py-0.5 text-stone-700 font-medium">
              Search: "{filterState.search}"
              <button type="button" onClick={() => onUpdateFilter(sectionKey, 'search', '')} className="hover:text-stone-900 cursor-pointer">
                <X size={11} />
              </button>
            </span>
          )}
          {filterState.designation !== 'All' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800 font-medium">
              Designation: {filterState.designation}
              <button type="button" onClick={() => onUpdateFilter(sectionKey, 'designation', 'All')} className="hover:text-emerald-950 cursor-pointer">
                <X size={11} />
              </button>
            </span>
          )}
          {filterState.research !== 'All' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-teal-800 font-medium">
              Research: {filterState.research}
              <button type="button" onClick={() => onUpdateFilter(sectionKey, 'research', 'All')} className="hover:text-teal-950 cursor-pointer">
                <X size={11} />
              </button>
            </span>
          )}
          {filterState.membership !== 'All' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-sky-800 font-medium">
              Member: {filterState.membership}
              <button type="button" onClick={() => onUpdateFilter(sectionKey, 'membership', 'All')} className="hover:text-sky-950 cursor-pointer">
                <X size={11} />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}


export default function TeacherManagement() {
  const { user } = useAuth()
  const defaultDept = user?.role === 'eee_system_admin' ? 'EEE' : 'CSE'
  const scopedDept = user?.role === 'eee_system_admin' ? 'EEE' : user?.role === 'system_admin' ? 'CSE' : null
  const [teachers, setTeachers] = useState([])
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState(scopedDept || 'All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ 
    name: '', 
    designation: 'Professor',
    education: '',
    researchFields: '',
    pabxExt: '',
    phone: '',
    email: '', 
    password: '', 
    website: '',
    department: defaultDept
  })
  const [photo, setPhoto] = useState(null)
  const [photoName, setPhotoName] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  
  const [researchSearch, setResearchSearch] = useState('')
  const [showResearchDropdown, setShowResearchDropdown] = useState(false)
  const filteredResearchFields = RESEARCH_FIELDS.filter(f => f.toLowerCase().includes(researchSearch.toLowerCase()))

  const [entryMode, setEntryMode] = useState('manual')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    async function loadTeachers() {
      try {
        const { data } = await api.get('/admin/teachers')
        setTeachers(data)
      } catch (error) {
        setNotice(errorMessage(error, 'Failed to load teachers.'))
      } finally {
        setLoading(false)
      }
    }
    loadTeachers()
  }, [])

  useEffect(() => {
    const mainEl = document.querySelector('main')
    if (mainEl) {
      mainEl.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => {
        setNotice('')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [notice])

  const [filters, setFilters] = useState({
    active: { search: '', designation: 'All', research: 'All', membership: 'All' },
    leave: { search: '', designation: 'All', research: 'All', membership: 'All' },
    resigned: { search: '', designation: 'All', research: 'All', membership: 'All' },
  })

  const updateFilter = (sectionKey, field, value) => {
    setFilters(prev => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], [field]: value }
    }))
  }

  const resetFilters = (sectionKey) => {
    setFilters(prev => ({
      ...prev,
      [sectionKey]: { search: '', designation: 'All', research: 'All', membership: 'All' }
    }))
  }

  const isFilterActive = (sectionKey) => {
    const f = filters[sectionKey]
    if (!f) return false
    return Boolean(f.search.trim()) || f.designation !== 'All' || f.research !== 'All' || f.membership !== 'All'
  }

  const allDesignations = useMemo(() => {
    const set = new Set()
    teachers.forEach(t => {
      if (t.designation) set.add(t.designation.trim())
    })
    const list = Array.from(set).sort()
    return list.length ? list : ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer']
  }, [teachers])

  const allResearchFields = useMemo(() => {
    const set = new Set()
    RESEARCH_FIELDS.forEach(f => set.add(f.trim()))
    teachers.forEach(t => {
      if (t.researchFields) {
        t.researchFields.split(',').forEach(f => {
          const trimmed = f.trim()
          if (trimmed) set.add(trimmed)
        })
      }
    })
    return Array.from(set).sort()
  }, [teachers])

  const allMemberships = useMemo(() => {
    const set = new Set()
    teachers.forEach(t => {
      if (t.professionalMembership) {
        t.professionalMembership.split(',').forEach(m => {
          const trimmed = m.trim()
          if (trimmed) set.add(trimmed)
        })
      }
    })
    return Array.from(set).sort()
  }, [teachers])

  const filterFaculty = (teacherList, sectionFilter) => {
    return teacherList.filter((teacher) => {
      const { search, designation, research, membership } = sectionFilter

      // 1. Free text keyword search (name, email, education, phone, etc.)
      if (search && search.trim()) {
        const q = search.toLowerCase().trim()
        const text = `${teacher.name} ${teacher.email} ${teacher.phone || ''} ${teacher.education || ''} ${teacher.designation || ''} ${teacher.researchFields || ''} ${teacher.professionalMembership || ''}`.toLowerCase()
        if (!text.includes(q)) return false
      }

      // 2. Designation Filter (Single / Group)
      if (designation && designation !== 'All') {
        const teacherDesig = (teacher.designation || '').toLowerCase()
        if (!teacherDesig.includes(designation.toLowerCase())) return false
      }

      // 3. Research Area Filter (Single / Group)
      if (research && research !== 'All') {
        const fields = (teacher.researchFields || '').toLowerCase()
        if (!fields.includes(research.toLowerCase())) return false
      }

      // 4. Professional Membership Filter (Single / Group)
      if (membership && membership !== 'All') {
        const mem = (teacher.professionalMembership || '').toLowerCase()
        if (!mem.includes(membership.toLowerCase())) return false
      }

      return true
    })
  }

  const rawActive = useMemo(() => {
    return teachers.filter((t) => t.status === 'Active' || !t.status)
  }, [teachers])

  const rawLeave = useMemo(() => {
    return teachers.filter((t) => t.status === 'On leave' || t.status === 'Leave')
  }, [teachers])

  const rawResigned = useMemo(() => {
    return teachers.filter((t) => t.status === 'Resigned' || t.status === 'Disabled')
  }, [teachers])

  const activeTeachers = useMemo(() => {
    return filterFaculty(rawActive, filters.active)
  }, [rawActive, filters.active])

  const leaveTeachers = useMemo(() => {
    return filterFaculty(rawLeave, filters.leave)
  }, [rawLeave, filters.leave])

  const resignedTeachers = useMemo(() => {
    return filterFaculty(rawResigned, filters.resigned)
  }, [rawResigned, filters.resigned])

  const scrollToSection = (sectionId) => {
    const el = document.getElementById(sectionId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const summary = [
    { label: 'Total teachers', value: teachers.length, icon: BriefcaseBusiness, tone: 'emerald' },
    { label: 'Active faculty', value: teachers.filter((t) => t.status === 'Active' || !t.status).length, icon: CheckCircle2, tone: 'sky' },
    { label: 'Pending review', value: teachers.filter((t) => t.status === 'Pending').length, icon: UserCog, tone: 'amber' },
    { label: 'Assigned courses', value: teachers.reduce((sum, t) => sum + (t.courses || 0), 0), icon: GraduationCap, tone: 'violet' },
  ]

  const resetTeacherForm = () => {
    setEditingId(null)
    setForm({ 
      name: '', 
      designation: 'Professor',
      education: '',
      professionalMembership: '',
      researchFields: '',
      pabxExt: '',
      phone: '',
      email: '', 
      password: '', 
      website: '',
      department: defaultDept
    })
    setResearchSearch('')
    setPhoto(null)
    setPhotoName('')
  }

  const handleEditTeacher = (teacher) => {
    setEditingId(teacher.id)
    setForm({
      name: teacher.name || '',
      designation: teacher.designation || 'Professor',
      education: teacher.education || '',
      professionalMembership: teacher.professionalMembership || '',
      researchFields: teacher.researchFields || '',
      pabxExt: teacher.pabxExt || '',
      phone: teacher.phone || '',
      email: teacher.email || '',
      password: '',
      website: teacher.website || '',
      department: teacher.department || 'CSE',
    })
    setResearchSearch(teacher.researchFields || '')
    setPhoto(null)
    setPhotoName('')
    
    // Scroll to the form section
    const formSection = document.getElementById('teacher-form-section')
    if (formSection) {
      formSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleAddTeacher = async (event) => {
    event.preventDefault()
    if (!form.name || !form.email) return

    try {
      const payload = {
        name: form.name,
        designation: form.designation,
        education: form.education,
        professionalMembership: form.professionalMembership,
        researchFields: form.researchFields,
        pabxExt: form.pabxExt,
        phone: form.phone,
        email: form.email,
        website: form.website,
        department: form.department,
      }

      if (form.password) payload.password = form.password

      let data
      if (editingId) {
        const response = await api.patch(`/admin/teachers/${editingId}`, payload)
        data = response.data
        setTeachers((current) => current.map((teacher) => teacher.id === editingId ? {
          ...teacher,
          ...data,
          name: data.name,
          email: data.email,
          department: data.department || form.department,
          designation: data.designation || form.designation,
          status: data.status || teacher.status,
        } : teacher))
        setNotice(`Teacher ${data.name} updated.`)
      } else {
        const response = await api.post('/admin/teachers', payload)
        data = response.data
        setTeachers((current) => [{
          ...data,
          department: data.department || form.department,
          designation: form.designation,
          courses: 0,
          students: 0,
          status: data.status || 'Active',
          lastLogin: 'Now',
        }, ...current])
        setNotice(`Teacher ${data.name} saved to the database${photo ? ' with photo' : ''}.`)
      }

      resetTeacherForm()
    } catch (error) {
      setNotice(errorMessage(error, editingId ? 'Teacher could not be updated.' : 'Teacher could not be created.'))
    }
  }

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/admin/teachers/${id}/status`, { status })
      setTeachers((current) => current.map((teacher) => teacher.id === id ? { ...teacher, status } : teacher))
    } catch (error) {
      setNotice(errorMessage(error, 'Teacher status could not be updated.'))
    }
  }

  const handleBulkUpload = async (e) => {
    e.preventDefault()
    if (!uploadFile) return
    setUploading(true)
    setNotice('')
    
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      
      const { data } = await api.post('/admin/teachers/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      setNotice(`Successfully processed teachers: ${data.added || 0} added, ${data.updated || 0} updated. Skipped ${data.skipped || 0} items.`)
      setUploadFile(null)
      // Re-fetch teachers
      const { data: newTeachers } = await api.get('/admin/teachers')
      setTeachers(newTeachers)
    } catch (error) {
      setNotice(errorMessage(error, 'Bulk upload failed.'))
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAllTeachers = async () => {
    if (!window.confirm("Are you sure you want to delete all teachers? This cannot be undone.")) return;
    try {
      await api.delete('/admin/teachers/all')
      setTeachers([])
      setNotice('All teachers deleted successfully.')
    } catch (error) {
      setNotice(errorMessage(error, 'Teachers could not be deleted.'))
    }
  }

  const renderTeacherCard = (teacher) => (
    <div key={teacher.id} className="rounded-2xl border border-stone-200 bg-[#fcfbfa] p-5 shadow-2xs flex flex-col md:flex-row gap-6">
      {/* Left Column: Text Info */}
      <div className="flex-1">
        <div className="mb-4">
          <h3 className="mt-1 font-display text-2xl font-bold text-stone-900">{teacher.name}</h3>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200 font-semibold">
              {teacher.designation || 'Teacher'}
            </span>
            {teacher.status && teacher.status !== 'Active' && (
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusColors[teacher.status] || 'bg-stone-50 text-stone-700 ring-stone-200'}`}>
                {teacher.status}
              </span>
            )}
          </div>
        </div>

        <p className="text-[15px] leading-relaxed text-stone-800">
          {teacher.education || 'Education not specified'}
        </p>
        
        {teacher.professionalMembership && (
          <p className="mt-1 text-[15px] leading-relaxed text-stone-800">
            {teacher.professionalMembership}
          </p>
        )}

        <div className="mt-2 text-[15px] leading-relaxed text-stone-800">
          <span className="font-bold">Research Fields:</span> {teacher.researchFields || 'Not specified'}
        </div>

        <div className="mt-2 text-[15px] leading-relaxed text-stone-800">
          <span className="font-bold">PABX Ext:</span> {teacher.pabxExt || 'N/A'} <span className="mx-2 text-stone-300">|</span> <span className="font-bold">Mobile:</span> {teacher.phone || 'N/A'}
        </div>

        <div className="mt-1 text-[15px] leading-relaxed text-stone-800">
          <span className="font-bold">Email:</span> {teacher.email}
        </div>

        {teacher.website && (
          <div className="mt-1 text-[15px] leading-relaxed text-stone-800">
            <span className="font-bold">Website:</span>{' '}
            <a
              href={teacher.website.startsWith('http') ? teacher.website : `https://${teacher.website}`}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 hover:underline"
            >
              {teacher.website}
            </a>
          </div>
        )}

        {/* Action Buttons: Edit details | Active | Leave | Resigned */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleEditTeacher(teacher)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-stone-700 hover:bg-stone-50 transition-colors shadow-2xs cursor-pointer"
          >
            Edit details
          </button>
          
          <button
            type="button"
            onClick={() => updateStatus(teacher.id, 'Active')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold ring-1 transition-all shadow-2xs cursor-pointer ${
              (teacher.status === 'Active' || !teacher.status)
                ? 'bg-emerald-50 text-emerald-800 ring-emerald-300 font-bold'
                : 'border border-stone-200 bg-white text-stone-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
            }`}
          >
            Active
          </button>

          <button
            type="button"
            onClick={() => updateStatus(teacher.id, 'On leave')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold ring-1 transition-all shadow-2xs cursor-pointer ${
              (teacher.status === 'On leave' || teacher.status === 'Leave')
                ? 'bg-amber-50 text-amber-800 ring-amber-300 font-bold'
                : 'border border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100/80'
            }`}
          >
            Leave
          </button>

          <button
            type="button"
            onClick={() => updateStatus(teacher.id, 'Resigned')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold ring-1 transition-all shadow-2xs cursor-pointer ${
              (teacher.status === 'Resigned' || teacher.status === 'Disabled')
                ? 'bg-rose-50 text-rose-800 ring-rose-300 font-bold'
                : 'border border-rose-200 bg-rose-50/60 text-rose-800 hover:bg-rose-100/80'
            }`}
          >
            Resigned
          </button>
        </div>
      </div>

      {/* Right Column: Photo */}
      <div className="w-32 shrink-0 md:w-36 self-start">
        {teacher.picture ? (
          <img src={teacher.picture} alt={teacher.name} className="w-full aspect-[3/4] object-cover bg-stone-100 border-4 border-white shadow-sm ring-1 ring-stone-200" />
        ) : (
          <div className="w-full aspect-[3/4] bg-stone-100 border-4 border-white shadow-sm ring-1 ring-stone-200 flex flex-col items-center justify-center text-stone-400">
            <UserRound size={32} />
            <span className="mt-2 text-[10px] uppercase tracking-wider font-semibold">No Photo</span>
          </div>
        )}
      </div>
    </div>
  )

  return (

    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-[#f4f3f1] p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Faculty control</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">Teacher management</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <ShieldCheck size={15} /> Access verified
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-6 text-sm font-medium">
          <button
            type="button"
            onClick={() => scrollToSection('active-faculty-section')}
            className="text-blue-600 hover:text-blue-800 underline transition-colors cursor-pointer flex items-center gap-1.5"
          >
            Active Faculty
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
              {rawActive.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('leave-faculty-section')}
            className="text-blue-600 hover:text-blue-800 underline transition-colors cursor-pointer flex items-center gap-1.5"
          >
            Faculty on leave
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
              {rawLeave.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('resigned-faculty-section')}
            className="text-blue-600 hover:text-blue-800 underline transition-colors cursor-pointer flex items-center gap-1.5"
          >
            Resigned faculty
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
              {rawResigned.length}
            </span>
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-stone-500">{label}</p>
                <p className="mt-3 text-3xl font-bold text-stone-900">{value}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-${tone}-50 text-${tone}-700 ring-1 ring-${tone}-200`}>
                <Icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section id="teacher-form-section" className="grid gap-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4">
            <h3 className="font-display text-2xl font-bold text-stone-900">{editingId ? 'Edit teacher' : 'Add teacher'}</h3>
            <div className="flex bg-stone-100 p-1 rounded-xl">
              <button onClick={() => setEntryMode('manual')} className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${entryMode === 'manual' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>Manual Entry</button>
              <button onClick={() => setEntryMode('bulk')} className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${entryMode === 'bulk' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>Bulk Upload</button>
            </div>
          </div>

          {entryMode === 'manual' ? (
          <form className="mt-5 space-y-4" onSubmit={handleAddTeacher}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Full name</span>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="Dr. Ayesha Sultana" required />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Designation</span>
                <div className="flex flex-wrap gap-4 pt-1">
                  {['Professor', 'Associate Prof', 'Assistant Prof', 'Lecturer'].map((desig) => (
                    <label key={desig} className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="radio" 
                        name="designation" 
                        value={desig} 
                        checked={form.designation === desig} 
                        onChange={(e) => setForm({ ...form, designation: e.target.value })} 
                        className="h-4 w-4 cursor-pointer text-emerald-600 focus:ring-emerald-500 border-stone-300 accent-emerald-600"
                      />
                      <span className="text-sm text-stone-700 group-hover:text-stone-900">{desig}</span>
                    </label>
                  ))}
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Education</span>
                <input value={form.education} onChange={(event) => setForm({ ...form, education: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="Ph.D. in Computer Science" />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Professional Membership <span className="text-stone-400 lowercase normal-case font-normal">(optional)</span></span>
                <input value={form.professionalMembership} onChange={(event) => setForm({ ...form, professionalMembership: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="Member of IEEE" />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Research Fields</span>
                <div className="relative">
                  <input 
                    value={researchSearch} 
                    onChange={(event) => {
                      setResearchSearch(event.target.value)
                      setForm({ ...form, researchFields: event.target.value })
                    }}
                    onFocus={() => setShowResearchDropdown(true)}
                    onBlur={() => setTimeout(() => setShowResearchDropdown(false), 200)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" 
                    placeholder="Search or type field (e.g. AI, Data Science)" 
                  />
                  {showResearchDropdown && filteredResearchFields.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-lg py-1">
                      {filteredResearchFields.map(field => (
                        <div 
                          key={field}
                          className="px-3 py-2 hover:bg-emerald-50 cursor-pointer text-sm text-stone-700 transition-colors"
                          onClick={() => {
                            let currentFields = form.researchFields.split(',').map(f => f.trim()).filter(f => f);
                            // If the last typed part is being replaced, let's just append
                            // For simplicity, we just set it or append it.
                            if (currentFields.length > 0 && researchSearch === currentFields[currentFields.length - 1]) {
                               currentFields[currentFields.length - 1] = field;
                            } else if (researchSearch.trim() === '') {
                               currentFields.push(field);
                            } else {
                               currentFields = [field]; // simplify to single select/replace
                            }
                            const newVal = currentFields.join(', ');
                            setForm({...form, researchFields: newVal});
                            setResearchSearch(newVal);
                            setShowResearchDropdown(false);
                          }}
                        >
                          {field}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">PABX Ext <span className="text-stone-400 lowercase normal-case font-normal">(optional)</span></span>
                <input value={form.pabxExt} onChange={(event) => setForm({ ...form, pabxExt: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="3101" />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Phone</span>
                <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="+8801XXXXXXXXX" />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Academic email</span>
                <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 focus-within:border-emerald-400">
                  <Mail size={15} className="text-stone-400" />
                  <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full bg-transparent outline-none text-stone-700" placeholder="name@kuet.ac.bd" required />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Password</span>
                <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 focus-within:border-emerald-400">
                  <Lock size={15} className="text-stone-400" />
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    className="w-full bg-transparent outline-none text-stone-700"
                    placeholder={editingId ? 'Leave blank to keep current password' : 'Create password'}
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Website</span>
                <input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="https://example.com" />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Department</span>
                {scopedDept ? (
                  <div className="w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2.5 text-stone-700 font-semibold cursor-not-allowed">
                    {scopedDept}
                  </div>
                ) : (
                  <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                    {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                  </select>
                )}
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Teacher photo</span>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5 text-sm text-stone-600 hover:border-emerald-400 hover:bg-emerald-50/30">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    <ImagePlus size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{photoName || 'Choose teacher photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const selected = event.target.files?.[0]
                      setPhoto(selected || null)
                      setPhotoName(selected ? selected.name : '')
                    }}
                  />
                </label>
              </label>
            </div>

            <div className="flex gap-3 justify-end mt-4">
              <button type="button" onClick={resetTeacherForm} className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                <RotateCcw size={16} /> {editingId ? 'Cancel edit' : 'Clear form'}
              </button>
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                <Plus size={16} /> {editingId ? 'Save changes' : 'Save teacher'}
              </button>
            </div>
          </form>
          ) : (
          <form onSubmit={handleBulkUpload} className="py-4">
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 p-8 text-center hover:bg-stone-100 transition-colors cursor-pointer relative">
              <UploadCloud size={40} className="mb-3 text-stone-400" />
              <p className="text-sm font-semibold text-stone-700 mb-1">Click to upload an Excel spreadsheet</p>
              <p className="text-xs text-stone-500 mb-4">Supports .xlsx, .xls, or .csv containing teacher details (Name, Email, Password, Department, Designation). Passwords are securely hashed into the database.</p>
              
              <input type="file" onChange={(e) => setUploadFile(e.target.files[0])} accept=".xlsx,.xls,.csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" required />
              
              {uploadFile && (
                <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-stone-200 inline-flex items-center gap-2 z-10 relative">
                  <span className="text-sm font-medium text-emerald-700 truncate max-w-[200px]">{uploadFile.name}</span>
                  <X size={14} className="text-stone-400 hover:text-stone-600 cursor-pointer" onClick={(e) => { e.preventDefault(); setUploadFile(null); }} />
                </div>
              )}
            </div>
            
            <div className="mt-5 flex justify-end">
              <button type="submit" disabled={uploading || !uploadFile} className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-70">
                {uploading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadCloud size={16} /> Process & Upload
                  </>
                )}
              </button>
            </div>
          </form>
          )}
        </div>
      </section>

      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">{notice}</div>}

      {/* Active Faculty Section */}
      <section id="active-faculty-section" className="scroll-mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-3.5">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-bold text-stone-900">Active Faculty</h3>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
              {activeTeachers.length}{activeTeachers.length !== rawActive.length ? ` / ${rawActive.length}` : ''}
            </span>
          </div>
          <button 
            onClick={handleDeleteAllTeachers} 
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 active:scale-95 cursor-pointer"
          >
            <X size={16} /> Delete All
          </button>
        </div>

        {/* Search & Multi-Criteria Filtering on the line below */}
        <FacultyFilterBar
          sectionKey="active"
          sectionTitle="Active Faculty"
          filterState={filters.active}
          onUpdateFilter={updateFilter}
          onResetFilters={resetFilters}
          allDesignations={allDesignations}
          allResearchFields={allResearchFields}
          allMemberships={allMemberships}
        />

        <div className="mt-5 space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">Loading active faculty...</div>
          ) : activeTeachers.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">
              {isFilterActive('active') ? 'No active faculty matched your search and filter criteria.' : 'No active faculty found.'}
            </div>
          ) : (
            activeTeachers.map((teacher) => renderTeacherCard(teacher))
          )}
        </div>
      </section>

      {/* Faculty on Leave Section */}
      <section id="leave-faculty-section" className="scroll-mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-3.5">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-bold text-stone-900">Faculty on leave</h3>
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
              {leaveTeachers.length}{leaveTeachers.length !== rawLeave.length ? ` / ${rawLeave.length}` : ''}
            </span>
          </div>
        </div>

        {/* Search & Multi-Criteria Filtering on the line below */}
        <FacultyFilterBar
          sectionKey="leave"
          sectionTitle="Faculty on leave"
          filterState={filters.leave}
          onUpdateFilter={updateFilter}
          onResetFilters={resetFilters}
          allDesignations={allDesignations}
          allResearchFields={allResearchFields}
          allMemberships={allMemberships}
        />

        <div className="mt-5 space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">Loading faculty on leave...</div>
          ) : leaveTeachers.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">
              {isFilterActive('leave') ? 'No faculty on leave matched your search and filter criteria.' : 'No faculty currently on leave.'}
            </div>
          ) : (
            leaveTeachers.map((teacher) => renderTeacherCard(teacher))
          )}
        </div>
      </section>

      {/* Resigned Faculty Section */}
      <section id="resigned-faculty-section" className="scroll-mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-3.5">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-bold text-stone-900">Resigned Faculty</h3>
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
              {resignedTeachers.length}{resignedTeachers.length !== rawResigned.length ? ` / ${rawResigned.length}` : ''}
            </span>
          </div>
        </div>

        {/* Search & Multi-Criteria Filtering on the line below */}
        <FacultyFilterBar
          sectionKey="resigned"
          sectionTitle="Resigned Faculty"
          filterState={filters.resigned}
          onUpdateFilter={updateFilter}
          onResetFilters={resetFilters}
          allDesignations={allDesignations}
          allResearchFields={allResearchFields}
          allMemberships={allMemberships}
        />

        <div className="mt-5 space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">Loading resigned faculty...</div>
          ) : resignedTeachers.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">
              {isFilterActive('resigned') ? 'No resigned faculty matched your search and filter criteria.' : 'No resigned faculty found.'}
            </div>
          ) : (
            resignedTeachers.map((teacher) => renderTeacherCard(teacher))
          )}
        </div>
      </section>
    </div>
  )
}
