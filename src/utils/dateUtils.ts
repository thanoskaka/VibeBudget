export const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const date = new Date(dateStr + 'T00:00:00'); // Use T00:00:00 to avoid timezone shifts
  const d = date.getDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = monthNames[date.getMonth()];
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

export const getMonthYearLabel = (dateStr: string): string => {
  if (!dateStr) return "";
  const date = new Date(dateStr + 'T00:00:00');
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

export const formatMonth = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const getTodayStr = (): string => {
  return formatDate(new Date());
};

export const getFirstDayOfMonth = (date: Date): string => {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  return formatDate(firstDay);
};

export const getLastDayOfMonth = (date: Date): string => {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return formatDate(lastDay);
};
