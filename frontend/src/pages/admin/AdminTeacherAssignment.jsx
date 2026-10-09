import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Plus, Search, ChevronDown, X } from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

function fuzzyMatch(str, pattern) {
  const s = str.toLowerCase()
  const p = pattern.toLowerCase()
  let pIdx = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === p[pIdx]) {
      pIdx++
      if (pIdx === p.length) return true
    }
  }
  return pIdx === p.length
}

function TeacherSelect({ teachers, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const selectedTeacher = teachers.find(t => String(t.id) === String(value))
  const filteredTeachers = query === '' 
    ? teachers 
    : teachers.filter(t => fuzzyMatch(t.name, query))

  return (
    <div className="relative" ref={containerRef}>
      <div 
        className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus-within:border-emerald-400"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={selectedTeacher ? 'text-stone-900 truncate' : 'text-stone-500'}>
          {selectedTeacher ? selectedTeacher.name : 'Unassign'}
        </span>
        <ChevronDown size={16} className="text-stone-400 shrink-0" />
      </div>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-stone-200 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 border-b border-stone-100 px-3 py-2 text-stone-500">
            <Search size={14} className="shrink-0" />
            <input 
              type="text" 
              className="w-full bg-transparent text-sm outline-none placeholder:text-stone-400" 
              placeholder="Search teacher..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <div 
              className={`cursor-pointer px-3 py-2 text-sm hover:bg-stone-50 ${!value ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-stone-700'}`}
              onClick={() => { onChange(''); setIsOpen(false) }}
            >
              Unassign
            </div>
            {filteredTeachers.map(teacher => (
              <div 
                key={teacher.id}
                className={`cursor-pointer px-3 py-2 text-sm hover:bg-stone-50 truncate ${String(value) === String(teacher.id) ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-stone-700'}`}
                onClick={() => { onChange(String(teacher.id)); setIsOpen(false) }}
              >
                {teacher.name}
              </div>
            ))}
            {filteredTeachers.length === 0 && (
              <div className="px-3 py-3 text-center text-sm text-stone-500">No teachers found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminTeacherAssignment() {
  const [searchParams] = useSearchParams()

  const [courses, setCourses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState(searchParams.get('courseId') || '')
  const [assignments, setAssignments] = useState([
    { teacherId: '', section: 'Both' },
    { teacherId: '', section: 'Both' }
  ])
  const [savedAssignment, setSavedAssignment] = useState(false)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(searchParams.get('year') || '1')
  const [term, setTerm] = useState(searchParams.get('term') || '1')
  const [department, setDepartment] = useState(searchParams.get('dept') || 'CSE')
  const [session, setSession] = useState(searchParams.get('session') || '2025-2026')
  const sessionOptions = ['2020-2021', '2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026']
  const [teacherDepartment, setTeacherDepartment] = useState('CSE')

  const departments = ['CSE', 'EEE', 'ECE', 'ME', 'CE', 'IEM', 'BME', 'MSE', 'URP', 'ARCH', 'BECM', 'LE', 'TE', 'ChE', 'MTE', 'PHY', 'CHEM', 'MATH', 'HUM']
  if (!departments.includes(department)) setDepartment(departments[0])

  const filteredCourses = courses.filter(c => c.semester === `${year}-${term}` && c.department === department)

  // When year, term, department, or session changes, auto-select first available course if the current one isn't valid
  useEffect(() => {
    if (filteredCourses.length > 0) {
      const initialCourseId = searchParams.get('courseId')
      let targetCourse = filteredCourses.find(c => String(c.id) === selectedCourseId)
      
      // If we don't have a valid selected course, try the initialCourseId or default to the first one
      if (!targetCourse) {
        targetCourse = filteredCourses.find(c => String(c.id) === initialCourseId) || filteredCourses[0]
        setSelectedCourseId(String(targetCourse.id))
        setAssignments([
          { teacherId: targetCourse.teacher_id ? String(targetCourse.teacher_id) : '', section: targetCourse.section || 'Both' },
          { teacherId: '', section: 'Both' }
        ])
      }
    } else {
      setSelectedCourseId('')
      setAssignments([
        { teacherId: '', section: 'Both' },
        { teacherId: '', section: 'Both' }
      ])
    }
  }, [year, term, department, session, courses])

  useEffect(() => {
    async function loadData() {
      try {
        const [{ data: courseData }, { data: teacherData }] = await Promise.all([
          api.get('/admin/courses'),
          api.get('/admin/teachers'),
        ])
        setCourses(courseData)
        setTeachers(teacherData)

      } catch (error) {
        setNotice(errorMessage(error, 'Failed to load data.'))
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleTeacherAssignment = async () => {
    if (!selectedCourseId) return
    setNotice('')
    try {
      // Temporarily saving only the first assignment until backend supports multiple
      const { data } = await api.patch(`/admin/courses/${selectedCourseId}/teacher`, {
        teacher_id: assignments[0].teacherId ? Number(assignments[0].teacherId) : null,
        section: assignments[0].section,
      })
      setCourses((current) => current.map((course) => String(course.id) === String(data.id) ? data : course))
      
      setSavedAssignment(true)
      setTimeout(() => {
        setSavedAssignment(false)
      }, 2000)
    } catch (error) {
      setNotice(errorMessage(error, 'Teacher assignment failed.'))
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-[#f4f3f1] p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Resource Allocation</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">Teacher assignment</h2>
          </div>
        </div>
      </section>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">Loading data...</div>
      ) : (
        <div className="mx-auto max-w-3xl">
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-2xl font-bold text-stone-900">Course Information</h3>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700 ring-1 ring-sky-200">Live</span>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs space-y-6">
              <div className="flex gap-6">
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Year</span>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(y => (
                    <label key={y} className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 cursor-pointer hover:bg-stone-100 transition-colors">
                      <input type="radio" name="year" value={y} checked={String(year) === String(y)} onChange={(e) => setYear(e.target.value)} className="text-emerald-600 focus:ring-emerald-500" />
                      <span className="text-sm font-medium text-stone-700">{y}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Term</span>
                <div className="flex gap-2">
                  {[1, 2].map(t => (
                    <label key={t} className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 cursor-pointer hover:bg-stone-100 transition-colors">
                      <input type="radio" name="term" value={t} checked={String(term) === String(t)} onChange={(e) => setTerm(e.target.value)} className="text-emerald-600 focus:ring-emerald-500" />
                      <span className="text-sm font-medium text-stone-700">{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <label className="space-y-1.5 block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Session</span>
              <select value={session} onChange={(e) => setSession(e.target.value)} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                {sessionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Department</span>
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                {departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
              </select>
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Course</span>
              <select value={selectedCourseId} onChange={(event) => {
                const value = event.target.value
                setSelectedCourseId(value)
                const course = courses.find((item) => String(item.id) === String(value))
                setAssignments([
                  { teacherId: course?.teacher_id ? String(course.teacher_id) : '', section: course?.section || 'Both' },
                  { teacherId: '', section: 'Both' }
                ])
              }} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400 disabled:opacity-60" disabled={filteredCourses.length === 0}>
                {filteredCourses.length === 0 ? <option value="">No courses for {year}-{term}</option> : filteredCourses.map((course) => <option key={course.id} value={course.id}>{course.code} - {course.title}</option>)}
              </select>
              </label>
            </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-2xl font-bold text-stone-900">Teacher Information</h3>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs space-y-6">
                <label className="space-y-1.5 block max-w-[200px]">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Teacher Department</span>
                  <select value={teacherDepartment} onChange={(e) => {
                    setTeacherDepartment(e.target.value)
                    setAssignments(assignments.map(a => ({...a, teacherId: ''})))
                  }} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                    {departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                  </select>
                </label>

                <div className="space-y-4">
              {assignments.map((assignment, index) => (
                <div key={index} className="flex gap-4 items-end">
                  <div className="grid flex-1 grid-cols-[2fr_1fr] gap-4">
                    <label className="space-y-1.5 block">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Teacher {index + 1}</span>
                      <TeacherSelect 
                        teachers={teachers.filter(t => t.department === teacherDepartment)} 
                        value={assignment.teacherId} 
                        onChange={(val) => {
                          const newAssignments = [...assignments]
                          newAssignments[index].teacherId = val
                          setAssignments(newAssignments)
                        }} 
                      />
                    </label>

                    <div className="space-y-1.5 block">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Section</span>
                      <div className="flex gap-2">
                        {['A', 'B', 'Both'].map(sec => (
                          <label key={sec} className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 cursor-pointer hover:bg-stone-100 transition-colors">
                            <input type="radio" name={`section-${index}`} value={sec} checked={assignment.section === sec} onChange={(e) => {
                              const newAssignments = [...assignments]
                              newAssignments[index].section = e.target.value
                              setAssignments(newAssignments)
                            }} className="text-emerald-600 focus:ring-emerald-500" />
                            <span className="text-sm font-medium text-stone-700">{sec}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 mb-0.5">
                    <div className="w-11 shrink-0">
                      {index === assignments.length - 1 && (
                        <button type="button" onClick={() => setAssignments([...assignments, { teacherId: '', section: 'Both' }])} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors" title="Add another teacher">
                          <Plus size={20} />
                        </button>
                      )}
                    </div>
                    <div className="w-11 shrink-0">
                      {index > 1 && (
                        <button type="button" onClick={() => {
                          const newAssignments = [...assignments]
                          newAssignments.splice(index, 1)
                          setAssignments(newAssignments)
                        }} className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors" title="Remove teacher">
                          <X size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={handleTeacherAssignment} className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 ${savedAssignment ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-stone-900 hover:bg-stone-700'}`}>
              <Check size={16} /> {savedAssignment ? 'Saved!' : 'Save teacher assignment'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
