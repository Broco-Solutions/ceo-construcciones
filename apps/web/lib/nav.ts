import {
  LayoutDashboard,
  Building2,
  Package,
  Truck,
  Calculator,
  ClipboardList,
  FileSpreadsheet,
  ShoppingCart,
  Scale,
  FileText,
  PackageCheck,
  Warehouse,
  ArrowLeftRight,
  BarChart3,
  Users,
  MapPin,
  ScrollText,
  Upload,
  Bell,
  Settings,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import type { Perm } from './permissions';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  perm?: Perm;
  mobile?: boolean;
};
export type NavGroup = { label: string; icon: LucideIcon; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: 'General',
    icon: LayoutDashboard,
    items: [
      { href: '/', label: 'Inicio', icon: LayoutDashboard, mobile: true },
      {
        href: '/clientes',
        label: 'Clientes',
        icon: Users,
        perm: 'readClients',
      },
      { href: '/obras', label: 'Obras', icon: Building2 },
    ],
  },
  {
    label: 'Catálogo',
    icon: Package,
    items: [
      { href: '/materiales', label: 'Materiales', icon: Package },
      { href: '/costos', label: 'Costos de referencia', icon: Calculator, perm: 'readEconomic' },
      {
        href: '/catalogo',
        label: 'Rubros y unidades',
        icon: Tags,
        perm: 'readEconomic',
      },
      {
        href: '/proveedores',
        label: 'Proveedores y precios',
        icon: Truck,
        perm: 'readSuppliers',
      },
    ],
  },
  {
    label: 'Presupuesto',
    icon: Calculator,
    items: [
      {
        href: '/apu',
        label: 'Actividades de obra',
        icon: Calculator,
        perm: 'readEconomic',
      },
      {
        href: '/computos',
        label: 'Cómputos',
        icon: ClipboardList,
        perm: 'readEconomic',
      },
      {
        href: '/presupuestos',
        label: 'Presupuestos',
        icon: FileSpreadsheet,
        perm: 'readEconomic',
      },
    ],
  },
  {
    label: 'Compras',
    icon: ShoppingCart,
    items: [
      { href: '/pedidos', label: 'Pedidos', icon: ShoppingCart, mobile: true },
      {
        href: '/cotizaciones',
        label: 'Cotizaciones',
        icon: Scale,
        perm: 'readEconomic',
      },
      { href: '/ordenes', label: 'Órdenes de compra', icon: FileText },
      {
        href: '/recepciones',
        label: 'Recepciones',
        icon: PackageCheck,
        perm: 'receive',
        mobile: true,
      },
      {
        href: '/recepcion-delegada',
        label: 'Recepciones delegadas',
        icon: PackageCheck,
      },
      {
        href: '/administracion',
        label: 'Factura y pago informativo',
        icon: FileText,
        perm: 'invoiceAdmin',
      },
    ],
  },
  {
    label: 'Inventario',
    icon: Warehouse,
    items: [
      { href: '/stock', label: 'Stock', icon: Warehouse, mobile: true },
      {
        href: '/stock/movimientos',
        label: 'Movimientos',
        icon: ArrowLeftRight,
      },
      { href: '/stock/reservas', label: 'Reservas', icon: ClipboardList },
      { href: '/stock/alertas', label: 'Alertas de mínimos', icon: Bell },
    ],
  },
  {
    label: 'Informes',
    icon: BarChart3,
    items: [
      {
        href: '/reportes',
        label: 'Seguimiento de materiales',
        icon: BarChart3,
      },
      {
        href: '/indicadores',
        label: 'Clientes, obras y compras',
        icon: BarChart3,
        perm: 'readEconomic',
      },
    ],
  },
  {
    label: 'Administración',
    icon: Settings,
    items: [
      {
        href: '/admin/usuarios',
        label: 'Usuarios',
        icon: Users,
        perm: 'adminUsers',
      },
      {
        href: '/admin/ubicaciones',
        label: 'Ubicaciones',
        icon: MapPin,
        perm: 'manageLocations',
      },
      {
        href: '/admin/importaciones',
        label: 'Importaciones',
        icon: Upload,
        perm: 'adjustStock',
      },
      {
        href: '/admin/auditoria',
        label: 'Auditoría',
        icon: ScrollText,
        perm: 'adjustStock',
      },
    ],
  },
];
