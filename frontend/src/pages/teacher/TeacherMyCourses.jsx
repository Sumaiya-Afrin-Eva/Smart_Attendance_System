import { useEffect, useState } from 'react'
import { BookOpen, Users, Clock, Hash, CheckCircle2 } from 'lucide-react'
import api from '../../lib/api'

export default function TeacherMyCourses() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadCourses() {
      try {
        const { data } = await api.get('/teacher/courses')
        setCourses(data)
      } catch (err) {
        console.error('Failed to load courses', err)
      } finally {
        setLoading(false)
      }
    }
    loadCourses()
  }, [])

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Your Assigned Courses</p>
          <h2 className="font-display text-2xl font-bold text-stone-900">Assigned Classes & Modules</h2>
          <p className="text-sm text-stone-500">
            Below is the list of courses that the administrator has assigned to you.
          </p>
        </div>
      </section>

      {loading ? (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-2xs">
          <span className="text-stone-500 font-medium">Loading your courses...</span>
        </div>
      ) : courses.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-2xs">
          <BookOpen className="text-stone-300 mb-2" size={32} />
          <span className="text-stone-500 font-medium">No courses assigned to you yet.</span>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <article key={course.id} className="flex flex-col justify-between overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs transition hover:shadow-md">
              <div className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    <CheckCircle2 size={12} />
                    Active
                  </span>
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    {course.semester}
                  </span>
                </div>

                <div className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-600">
                  {course.code}
                </div>
                <h3 className="mb-4 font-display text-lg font-bold leading-tight text-stone-900">
                  {course.title}
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 rounded-xl bg-stone-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Type</span>
                    <span className="text-sm font-semibold capitalize text-stone-900">{course.course_type}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-xl bg-stone-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Credit</span>
                    <span className="text-sm font-semibold text-stone-900">{course.credit}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-xl bg-stone-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Section</span>
                    <span className="text-sm font-semibold text-stone-900">{course.section}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-xl bg-stone-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Session</span>
                    <span className="text-sm font-semibold text-stone-900">{course.session}</span>
                  </div>
                </div>
              </div>

              <div className="mt-auto border-t border-stone-100 bg-stone-50/50 px-5 py-3">
                <div className="flex items-center justify-between text-xs font-medium text-stone-500">
                  <span className="flex items-center gap-1.5">
                    <Users size={14} />
                    {course.students} students
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
