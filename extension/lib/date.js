/** Today's date — same style as Umbrella / your notebook (e.g. Jun 19, 2026). */
export function workflowDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
