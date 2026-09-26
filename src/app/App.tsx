import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { HomePage } from '../features/home/HomePage';
import { ModulePage } from '../features/shared/ModulePage';
import { ContactsPage } from '../features/contacts/ContactsPage';
import { ProductDefinitionsPage } from '../features/productDefinitions/ProductDefinitionsPage';
import { ProductsPage } from '../features/products/ProductsPage';
import { FabricsPage } from '../features/inventory/FabricsPage';
import { MaterialsPage } from '../features/inventory/MaterialsPage';
import { MachinesPage } from '../features/inventory/MachinesPage';
import { ProductionPage } from '../features/production/ProductionPage';
import type { ProductionView } from '../features/production/ProductionPage';
import { TrashPage } from '../features/production/TrashPage';
import { OrderCardsPage } from '../features/production/OrderCardsPage';
import { SalesPage } from '../features/sales/SalesPage';
import { FinancePage } from '../features/finance/FinancePage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { ModuleBoundary } from '../features/shared/WorkshopUI';
import { pages } from './navigation';

const productionViews: Record<string, ProductionView> = { 'production-tracking': 'tracking', 'production-completed': 'completed' };

function LegacyProductionRoute({ path }: { path: string }) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: path, search }} replace />;
}

export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = pages.find((page) => page.path === pathname)?.title ?? (pathname === '/' ? 'Ana Sayfa' : 'Sayfa bulunamadı');
    document.title = `${title} | Argent Tekstil`;
    document.getElementById('main-content')?.focus();
    window.scrollTo(0, 0);
  }, [pathname]);
  return <Routes><Route element={<Layout />}>
    <Route index element={<ModuleBoundary><HomePage /></ModuleBoundary>} />
    {pages.map((page) => <Route key={page.id} path={page.path} element={<ModuleBoundary key={page.id}>{page.id === 'customers' ? <ContactsPage customersOnly /> : page.id === 'contacts' ? <ContactsPage /> : page.id === 'product-definitions' ? <ProductDefinitionsPage /> : page.id === 'products' ? <ProductsPage /> : page.id === 'fabrics' ? <FabricsPage /> : page.id === 'materials' ? <MaterialsPage /> : page.id === 'equipment' ? <MachinesPage /> : page.id === 'production-trash' ? <TrashPage /> : page.id === 'production-archives' ? <OrderCardsPage archived /> : page.id === 'production-orders' ? <OrderCardsPage /> : productionViews[page.id] ? <ProductionPage view={productionViews[page.id]} /> : page.id === 'sales' ? <SalesPage /> : ['accounts', 'payments-made', 'payments-received', 'debts', 'receivables', 'expenses'].includes(page.id) ? <FinancePage page={page.id as 'accounts' | 'payments-made' | 'payments-received' | 'debts' | 'receivables' | 'expenses'} /> : page.id.endsWith('-report') ? <ReportsPage kind={page.id} /> : <ModulePage key={page.id} page={page} />}</ModuleBoundary>} />)}
    <Route path="/uretim/plan" element={<LegacyProductionRoute path="/uretim/siparisler" />} />
    <Route path="/uretim/yeni" element={<Navigate to="/uretim/siparisler" state={{ fromLegacyProduction: true }} replace />} />
    <Route path="/uretim/kesim-foyleri" element={<LegacyProductionRoute path="/uretim/takip" />} />
    <Route path="/uretim/fason" element={<LegacyProductionRoute path="/uretim/takip" />} />
    <Route path="/uretim/devam-eden" element={<LegacyProductionRoute path="/uretim/takip" />} />
    <Route path="*" element={<div className="not-found"><span className="eyebrow">404</span><h1>Sayfa bulunamadı</h1><p>Bu adres mevcut bir sayfaya ait değil.</p><Link className="button" to="/">Ana Sayfaya dön</Link></div>} />
  </Route></Routes>;
}
