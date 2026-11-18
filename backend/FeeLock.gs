/**
 * FeeLock.gs - a student whose fee is overdue cannot open their portal until the payment is applied.
 * "Overdue" is the day after the due date (payStatus_ in Code.gs), so the due day itself is still open. Students who are exempt are never locked.
 * Signing in still works, and returns a "locked" answer that the dashboards show as a pay-now screen. Every other request is refused,
 * so a locked student cannot reach assignments, exams, quizzes, the library, recordings or anything else by calling the server directly.
 * To lock on the due date itself instead, change classLocked_ in Code.gs.
 */
function feeLockPayload_(st, programme) {
  const fee = Number(st.MonthlyFee) || Number(st.Fee) || 0;
  return { ok: true, locked: true, programme: programme || '',
    student: { StudentID: String(st.StudentID).trim(), Name: st.Name, NextDue: iso_(st.NextDue), Fee: fee, PaymentStatus: 'Overdue' },
    message: 'Your fee was due on ' + (iso_(st.NextDue) || 'the date shown') + '. Your portal opens again as soon as the payment is applied.' };
}
function feeLockRefuse_() {
  return { ok: false, locked: true, error: 'Your fee is overdue. Pay it and your portal opens again straight away.' };
}
