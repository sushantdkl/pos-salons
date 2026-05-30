// Nepal timezone utilities
// Nepal Standard Time (NST) is UTC+5:45

export function getNepaliDateTime() {
  const now = new Date();
  // Convert to Nepal time (UTC+5:45)
  const nepalTime = new Date(now.getTime() + (5.75 * 60 * 60 * 1000));
  return nepalTime.toISOString().replace('Z', '+05:45');
}

export function getNepaliDateString(inputDate = null) {
  const now = inputDate ? new Date(inputDate) : new Date();
  // Convert to Nepal time (UTC+5:45)
  const nepalTime = new Date(now.getTime() + (5.75 * 60 * 60 * 1000));
  return nepalTime.toISOString().split('T')[0];
}

export function getNepaliNow() {
  const now = new Date();
  // Convert to Nepal time (UTC+5:45)
  return new Date(now.getTime() + (5.75 * 60 * 60 * 1000));
}

export function formatNepalTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', { 
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}
