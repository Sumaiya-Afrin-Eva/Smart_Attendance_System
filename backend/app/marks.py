"""Attendance marking rule (change it here only).

  attendance >= 90%        -> 10 marks
  60% <= attendance < 90%  -> 0 to 10, straight line (60% = 0, 75% = 5, 90% = 10)
  attendance < 60%         -> Incomplete (no marks)
"""
FULL_MARKS = 10
FULL_AT = 90.0
INCOMPLETE_BELOW = 60.0


def attendance_percent(attended: int, held: int) -> float | None:
    if held == 0:
        return None
    return round(attended / held * 100, 1)


def attendance_marks(percent: float | None) -> dict:
    if percent is None:
        return {"marks": None, "grade": "no_classes", "label": "No classes yet"}
    if percent >= FULL_AT:
        return {"marks": FULL_MARKS, "grade": "full", "label": "Full marks"}
    if percent < INCOMPLETE_BELOW:
        return {"marks": None, "grade": "incomplete", "label": "Incomplete"}
    marks = (percent - INCOMPLETE_BELOW) / (FULL_AT - INCOMPLETE_BELOW) * FULL_MARKS
    return {"marks": round(marks, 1), "grade": "partial", "label": "Partial marks"}


RULE = {
    "full_marks": FULL_MARKS,
    "full_at": FULL_AT,
    "incomplete_below": INCOMPLETE_BELOW,
}
