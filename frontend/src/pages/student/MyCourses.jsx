import { useState } from 'react'
import { BookOpen, Layers, Pencil, Sparkles, X } from 'lucide-react'
import { useEnrollments, useProfile } from '../../lib/queries'
import { Badge, Button, Card, EmptyState, Spinner } from '../../components/ui'
import CourseSelector from '../../components/student/CourseSelector'

export default function MyCourses() {
  const { data: profile, isLoading } = useProfile()
  const { data: enrollments, isLoading: loadingEnrollments } = useEnrollments()
  const [editing, setEditing] = useState(null)

  if (isLoading || loadingEnrollments) return <Spinner label="Loading registered courses…" />

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-stone-900">Enrolled Courses</h2>
          <p className="mt-0.5 text-xs text-stone-500 font-medium">
            {profile?.department} Department · Active Semester {profile?.current_semester}
          </p>
        </div>
        {!editing && (
          <Button onClick={() => setEditing(profile.current_semester)} className="cursor-pointer">
            <Pencil size={14} /> Modify Courses
          </Button>
        )}
      </div>

      {/* Editing Course Selection Box */}
      {editing && (
        <Card
          title={`Modify Courses — Semester ${editing}`}
          subtitle="Courses with existing recorded attendance cannot be removed"
          icon={Layers}
        >
          <div className="p-6">
            <CourseSelector profile={profile} initialSemester={editing} onSaved={() => setEditing(null)} />
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex items-center gap-1.5 rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                <X size={14} /> Cancel Selection
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Course Lists by Semester */}
      {enrollments?.length ? (
        <div className="space-y-6">
          {enrollments.map(({ semester, courses }) => {
            const totalCredits = courses.reduce((s, c) => s + c.credit, 0)
            return (
              <Card
                key={semester}
                title={`Semester ${semester} Curriculum`}
                subtitle={`${courses.length} Registered Courses · Total ${totalCredits} Credit Units`}
                icon={BookOpen}
                action={
                  !editing && (
                    <button
                      onClick={() => setEditing(semester)}
                      className="flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-900 cursor-pointer"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  )
                }
              >
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  {courses.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-stone-200/80 bg-stone-50/40 p-4 transition-all duration-150 hover:border-emerald-300 hover:bg-emerald-50/20 hover:shadow-2xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-xs font-bold text-stone-900 font-mono">{c.code}</span>
                          <Badge tone={c.type === 'Lab' ? 'cyan' : 'slate'} className="text-[10px]">
                            {c.type}
                          </Badge>
                        </div>
                        <p className="mt-1 font-display text-sm font-semibold text-stone-800 leading-snug">{c.title}</p>
                        <p className="mt-1 text-xs font-medium text-stone-500 font-mono">{c.credit} Credit Units</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No course registrations found"
            text="Please pick your courses to start tracking attendance and marks."
            action={
              <Button onClick={() => setEditing(profile.current_semester)}>
                <Sparkles size={14} /> Register Courses
              </Button>
            }
          />
        </Card>
      )}
    </div>
  )
}
