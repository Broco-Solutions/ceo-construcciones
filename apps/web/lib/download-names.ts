/** Nombres de descargas visibles al usuario de CEO Construcciones. */
const EXPORT_NAME: Record<string, string> = {
  works: 'obras',
  suppliers: 'proveedores',
  materials: 'materiales',
  prices: 'precios',
  stock: 'stock',
  'purchase-orders': 'ordenes-de-compra',
};

const TEMPLATE_NAME: Record<string, string> = {
  clients: 'clientes',
  works: 'obras',
  suppliers: 'proveedores',
  materials: 'materiales',
  prices: 'precios',
  'purchase-orders': 'ordenes-de-compra',
  'initial-stock': 'stock-inicial',
};

/** Fecha de la descarga en Argentina, sin hora; estable incluso cerca de medianoche UTC. */
export function downloadDateAR(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (kind: string) => parts.find((p) => p.type === kind)?.value;
  return [get('year'), get('month'), get('day')].join('-');
}

export function exportFilename(path: string, date = new Date()): string {
  const key = path.split('/').pop() ?? '';
  const label = EXPORT_NAME[key];
  if (!label) throw new Error('Exportación no reconocida');
  return label + '-' + downloadDateAR(date) + '.xlsx';
}

export function templateFilename(kind: string, date = new Date()): string {
  const label = TEMPLATE_NAME[kind];
  if (!label) throw new Error('Plantilla no reconocida');
  return 'plantilla-' + label + '-' + downloadDateAR(date) + '.csv';
}
