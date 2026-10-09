import { BookOpen } from 'lucide-react'
import { useEnrollments, useProfile } from '../../lib/queries'
import { Badge, Card, EmptyState, Spinner } from '../../components/ui'

export default function MyCourses() {
  const { data: profile, isLoading } = useProfile()
  const { data: enrollments, isLoading: loadingEnrollments } = useEnrollments()

  if (isLoading || loadingEnrollments) return <Spinner label="Loading registered courses…" />

  return (
    <div className="space-y-7">
      {/* Header Info */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-stone-900">Enrolled Courses</h2>
          <p className="mt-1 text-sm text-stone-500 font-medium">
            {profile?.department} Department · Active Semester {profile?.current_semester}
          </p>
        </div>
      </div>

      {/* Course Lists by Semester */}
      {enrollments?.length ? (
        <div className="space-y-7">
          {enrollments.map(({ semester, courses }) => {
            const totalCredits = courses.reduce((s, c) => s + c.credit, 0)
            return (
              <Card
                key={semester}
                title={`Semester ${semester} Curriculum`}
                subtitle={`${courses.length} Registered Courses · Total ${totalCredits} Credit Units`}
                icon={BookOpen}
              >
                <div className="grid gap-3.5 p-6 sm:grid-cols-2">
                  {courses.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start justify-between gap-3.5 rounded-xl border border-stone-200/80 bg-stone-50/40 p-4.5 transition-all duration-150 hover:border-emerald-300 hover:bg-emerald-50/20 hover:shadow-2xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <span className="font-display text-sm font-bold text-stone-900 font-mono">{c.code}</span>
                          <Badge tone={c.type === 'Lab' ? 'cyan' : 'slate'} className="text-xs">
                            {c.type}
                          </Badge>
                        </div>
                        <p className="mt-1.5 font-display text-base font-semibold text-stone-900 leading-snug">{c.title}</p>
                        <p className="mt-1 text-xs sm:text-sm font-medium text-stone-500 font-mono">{c.credit} Credit Units</p>
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
            title="No courses assigned yet"
            text="Your assigned courses will appear here."
          />
        </Card>
      )}
    </div>
  )
}
