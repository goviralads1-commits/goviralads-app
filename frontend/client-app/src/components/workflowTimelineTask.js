export const utcDayKey = (value) => (
  value ? new Date(value).toISOString().slice(0, 10) : null
);

const laneByStatus = {
  PENDING_APPROVAL: 'PENDING',
  PENDING: 'SCHEDULED',
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  IN_PROGRESS: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'PENDING',
};

// One date/status normalization used by both Workflow Timeline and Calendar.
// Keep the existing semantics: deadline is used only when endDate is absent.
export const normalizeWorkflowTask = (task) => {
  const endDate = task?.endDate || task?.deadline || null;
  const calendarStartDate = task?.startDate || endDate;
  const calendarEndDate = endDate || task?.startDate || null;

  return {
    ...task,
    endDate,
    calendarStartDate,
    calendarEndDate,
    startDay: utcDayKey(task?.startDate),
    endDay: utcDayKey(endDate),
    completedDay: utcDayKey(task?.completedAt),
    // Never let an unexpected legacy status remove a real task event from the graph.
    lane: laneByStatus[task?.status] || 'PENDING',
  };
};
