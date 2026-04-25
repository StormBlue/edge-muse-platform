export function defaultSessionTitle(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
