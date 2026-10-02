export function sessionProgress(
  plan: { order: number; skipped: boolean | number }[],
  entries: { exerciseOrder: number; completed: boolean | number }[],
) {
  const required = plan.filter((exercise) => !exercise.skipped);
  const completedOrders = new Set(
    entries
      .filter((entry) => entry.completed)
      .map((entry) => entry.exerciseOrder),
  );
  const count = required.filter((exercise) =>
    completedOrders.has(exercise.order),
  ).length;
  const total = required.length;
  return { count, total, complete: total > 0 && count === total };
}
