import { useEffect, useMemo, useState } from 'react'
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
  ShieldCheck,
  UserCog,
  UserRound,
  X,
  UploadCloud,
  Phone,
  Smartphone,
  BookOpen
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

const statusColors = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'On leave': 'bg-amber-50 text-amber-700 ring-amber-200',
  Pending: 'bg-sky-50 text-sky-700 ring-sky-200',
  Disabled: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const DEPARTMENTS = ["CSE", "EEE", "ECE", "ME", "CE", "IEM", "BME", "MSE", "URP", "ARCH", "BECM", "LE", "TE", "ChE", "MTE", "PHY", "CHEM", "MATH", "HUM"];


export default function TeacherManagement() {
  const [teachers, setTeachers] = useState([])
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('All')
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
    department: 'CSE'
  })
  const [photo, setPhoto] = useState(null)
  const [photoName, setPhotoName] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  
  const [researchSearch, setResearchSearch] = useState('')
  const [showResearchDropdown, setShowResearchDropdown] = useState(false)
  const RESEARCH_FIELDS = [
    "Artificial Intelligence", "Machine Learning", "Data Science", "Computer Vision",
    "Natural Language Processing", "Software Engineering", "Computer Networks",
    "Cybersecurity", "Database Systems", "Human-Computer Interaction",
    "Internet of Things (IoT)", "VLSI Design", "Power Systems",
    "Renewable Energy", "Robotics", "Bioinformatics", "Cloud Computing"
  ]
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
    if (notice) {
      const timer = setTimeout(() => {
        setNotice('')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [notice])

  const filteredTeachers = useMemo(() => {
    return teachers.filter((teacher) => {
      const matchesSearch = `${teacher.name} ${teacher.email}`.toLowerCase().includes(search.toLowerCase())
      const matchesDepartment = department === 'All' || teacher.department === department
      const matchesStatus = statusFilter === 'All' || teacher.status === statusFilter
      return matchesSearch && matchesDepartment && matchesStatus
    })
  }, [teachers, search, department, statusFilter])

  const summary = [
    { label: 'Total teachers', value: teachers.length, icon: BriefcaseBusiness, tone: 'emerald' },
    { label: 'Active faculty', value: teachers.filter((t) => t.status === 'Active').length, icon: CheckCircle2, tone: 'sky' },
    { label: 'Pending review', value: teachers.filter((t) => t.status === 'Pending').length, icon: UserCog, tone: 'amber' },
    { label: 'Assigned courses', value: teachers.reduce((sum, t) => sum + t.courses, 0), icon: GraduationCap, tone: 'violet' },
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
      department: 'CSE'
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
      
      setNotice(`Successfully added ${data.added} teachers. Skipped ${data.skipped} items (duplicates or errors).`)
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
          <button type="button" onClick={() => setStatusFilter(statusFilter === 'Active' ? 'All' : 'Active')} className={`underline hover:text-blue-800 transition-colors ${statusFilter === 'Active' ? 'text-blue-800 font-bold' : 'text-blue-600'}`}>Active Faculty</button>
          <button type="button" onClick={() => setStatusFilter(statusFilter === 'On leave' ? 'All' : 'On leave')} className={`underline hover:text-blue-800 transition-colors ${statusFilter === 'On leave' ? 'text-blue-800 font-bold' : 'text-blue-600'}`}>Faculty on leave</button>
          <button type="button" onClick={() => setStatusFilter(statusFilter === 'Disabled' ? 'All' : 'Disabled')} className={`underline hover:text-blue-800 transition-colors ${statusFilter === 'Disabled' ? 'text-blue-800 font-bold' : 'text-blue-600'}`}>Resigned faculty</button>
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
                <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                  {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                </select>
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
              <p className="text-xs text-stone-500 mb-4">Supports .xlsx, .xls, or .csv containing teacher details (Name, Email, Department, Designation)</p>
              
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

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Faculty roster</p>
            <h3 className="mt-2 text-2xl font-bold text-stone-900">Teachers</h3>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-600">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="text" placeholder="Search name or email" className="w-44 bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400" />
          </div>
        </div>

          <div className="mt-5 flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <select value={department} onChange={(event) => setDepartment(event.target.value)} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none">
                <option value="All">All departments</option>
                {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none">
                <option value="All">All status</option>
                <option value="Active">Active</option>
                <option value="On leave">On leave</option>
                <option value="Pending">Pending</option>
                <option value="Disabled">Disabled</option>
              </select>
            </div>
            <button 
              onClick={handleDeleteAllTeachers} 
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 active:scale-95"
            >
              <X size={16} /> Delete All
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">Loading teachers...</div>
            ) : filteredTeachers.length === 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">No teachers matched your search.</div>
            ) : (
              filteredTeachers.map((teacher) => (
                <div key={teacher.id} className="rounded-2xl border border-stone-200 bg-[#fcfbfa] p-5 shadow-2xs flex flex-col md:flex-row gap-6">
                  {/* Left Column: Text Info */}
                  <div className="flex-1">
                    <div className="mb-4">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">{teacher.department}</p>
                      <h3 className="mt-2 font-display text-2xl font-bold text-stone-900">{teacher.name}</h3>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200">{teacher.designation || 'Teacher'}</span>
                      </div>
                    </div>

                    <p className="text-[15px] leading-relaxed text-stone-800">
                      {teacher.education || 'Education not specified'}
                    </p>
                    
                    <p className="mt-1 text-[15px] leading-relaxed text-stone-800">
                      {teacher.professionalMembership || 'N/A'}
                    </p>

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
                        <span className="font-bold">Website:</span> <a href={teacher.website.startsWith('http') ? teacher.website : `https://${teacher.website}`} target="_blank" rel="noreferrer" className="hover:underline">{teacher.website}</a>
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => handleEditTeacher(teacher)} className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-stone-700 hover:bg-stone-50">
                        Edit details
                      </button>
                      <button type="button" onClick={() => updateStatus(teacher.id, teacher.status === 'Active' ? 'Disabled' : 'Active')} className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1 transition-colors cursor-pointer ${teacher.status === 'Disabled' ? 'bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'}`}>
                        {teacher.status || 'Active'}
                      </button>
                      <button type="button" onClick={() => updateStatus(teacher.id, 'On leave')} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[13px] font-semibold text-amber-700 hover:bg-amber-100">
                        Leave
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
              ))
            )}
          </div>
      </section>
    </div>
  )
}
