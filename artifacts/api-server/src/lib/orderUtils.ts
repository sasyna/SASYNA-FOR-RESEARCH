export function generateOrderId(): string {
  const digits = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `SAS-${digits}`;
}
