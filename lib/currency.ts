export function formatCentsAsBRL(cents: number): string {
  const value = (cents / 100).toFixed(2).replace('.', ',');
  const [intPart, decPart] = value.split(',');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${withThousands},${decPart}`;
}
