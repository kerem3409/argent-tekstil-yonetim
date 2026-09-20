import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { HomePage } from '../features/home/HomePage';
import { ModulePage } from '../features/shared/ModulePage';
import { ContactsPage } from '../features/contacts/ContactsPage';
import { ProductsPage } from '../features/products/ProductsPage';
import { FabricsPage } from '../features/inventory/FabricsPage';
import { MaterialsPage } from '../features/inventory/MaterialsPage';
import { MachinesPage } from '../features/inventory/MachinesPage';
import { PlansPage } from '../features/production/PlansPage';
import { JobsPage } from '../features/production/JobsPage';
import { SubcontractsPage } from '../features/production/SubcontractsPage';
import { SalesPage } from '../features/sales/SalesPage';
import { FinancePage } from '../features/finance/FinancePage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { ModuleBoundary } from '../features/shared/WorkshopUI';
import { pages } from './navigation';

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
    {pages.map((page) => <Route key={page.id} path={page.path} element={<ModuleBoundary key={page.id}>{page.id === 'contacts' ? <ContactsPage /> : page.id === 'products' ? <ProductsPage /> : page.id === 'fabrics' ? <FabricsPage /> : page.id === 'materials' ? <MaterialsPage /> : page.id === 'equipment' ? <MachinesPage /> : page.id === 'plans' ? <PlansPage /> : page.id === 'in-progress' ? <JobsPage /> : page.id === 'subcontracting' ? <SubcontractsPage /> : page.id === 'sales' ? <SalesPage /> : ['accounts', 'payments-made', 'payments-received', 'debts', 'receivables', 'expenses'].includes(page.id) ? <FinancePage page={page.id as 'accounts' | 'payments-made' | 'payments-received' | 'debts' | 'receivables' | 'expenses'} /> : page.id.endsWith('-report') ? <ReportsPage kind={page.id} /> : <ModulePage key={page.id} page={page} />}</ModuleBoundary>} />)}
    <Route path="*" element={<div className="not-found"><span className="eyebrow">404</span><h1>Sayfa bulunamadı</h1><p>Bu adres mevcut bir sayfaya ait değil.</p><Link className="button" to="/">Ana Sayfaya dön</Link></div>} />
  </Route></Routes>;
}
