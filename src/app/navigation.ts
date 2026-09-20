export type PageDefinition = {
  id: string;
  title: string;
  path: string;
  description: string;
  columns: string[];
  subgroup?: string;
};

export type NavigationGroup = { title: string; symbol: string; pages: PageDefinition[] };

export const navigation: NavigationGroup[] = [
  { title: 'Stok', symbol: 'stock', pages: [
    { id: 'products', title: 'Stoktaki Ürünler', path: '/stok/urunler', description: 'Atölyenizdeki hazır ürün kayıtlarını bu alandan takip edin.', columns: ['Ürün Kodu', 'Ürün Adı', 'Miktar', 'Birim'] },
    { id: 'fabrics', title: 'Stoktaki Kumaşlar', path: '/stok/kumaslar', description: 'Kumaş stok kayıtlarını tek bir yerde görüntüleyin.', columns: ['Kumaş Kodu', 'Kumaş Adı', 'Miktar', 'Birim'] },
    { id: 'materials', title: 'Stoktaki Malzemeler', path: '/stok/malzemeler', description: 'Üretimde kullanılan yardımcı malzemeleri takip edin.', columns: ['Malzeme Kodu', 'Malzeme Adı', 'Miktar', 'Birim'] },
    { id: 'equipment', title: 'Makine & Teçhizat', path: '/stok/makine-techizat', description: 'Atölyenin makine ve teçhizat kayıtlarını görüntüleyin.', columns: ['Makine Kodu', 'Makine Adı', 'Konum', 'Durum'] },
  ] },
  { title: 'Üretim', symbol: 'production', pages: [
    { id: 'plans', title: 'Üretim Planı', path: '/uretim/plan', description: 'Planlanan üretim işlerini bu alandan takip edin.', columns: ['Plan No', 'Ürün', 'Planlanan Miktar', 'Planlanan Tarih'] },
    { id: 'in-progress', title: 'Üretim Aşamasındaki Ürünler', path: '/uretim/devam-eden', description: 'Devam eden üretim işlerini görüntüleyin.', columns: ['İş No', 'Ürün', 'Aşama', 'Miktar'] },
    { id: 'subcontracting', title: 'Fason Takibi', path: '/uretim/fason', description: 'Fason üretim işlerini ve ilgili firmaları takip edin.', columns: ['İş No', 'Firma', 'Ürün', 'Durum'] },
  ] },
  { title: 'Satışlar', symbol: 'sales', pages: [
    { id: 'sales', title: 'Satış Listesi', path: '/satislar', description: 'Satış kayıtlarını bu alanda görüntüleyin.', columns: ['Satış No', 'Müşteri', 'Tarih', 'Durum'] },
  ] },
  { title: 'Firma / Kişiler', symbol: 'people', pages: [
    { id: 'contacts', title: 'Firma / Kişi Listesi', path: '/firma-kisiler', description: 'Birlikte çalıştığınız firma ve kişilerin kayıtlarını görüntüleyin.', columns: ['Kod', 'Firma / Kişi', 'Tür', 'Telefon'] },
  ] },
  { title: 'Finans', symbol: 'finance', pages: [
    { id: 'accounts', title: 'Cari Hesaplar', path: '/finans/cari-hesaplar', description: 'Firma ve kişilere ait cari hesap kayıtlarını görüntüleyin.', columns: ['Cari Kodu', 'Firma / Kişi', 'Hesap Türü', 'Para Birimi'] },
    { id: 'payments-made', title: 'Yapılan Ödemeler', path: '/finans/yapilan-odemeler', subgroup: 'Para Hareketleri', description: 'Yapılan ödeme kayıtlarını bu alanda takip edin.', columns: ['İşlem No', 'Firma / Kişi', 'Tarih', 'Tutar'] },
    { id: 'payments-received', title: 'Alınan Ödemeler', path: '/finans/alinan-odemeler', subgroup: 'Para Hareketleri', description: 'Alınan ödeme kayıtlarını bu alanda takip edin.', columns: ['İşlem No', 'Firma / Kişi', 'Tarih', 'Tutar'] },
    { id: 'debts', title: 'Borç Listesi', path: '/finans/borclar', description: 'Borç kayıtlarını bu alanda görüntüleyin.', columns: ['Kayıt No', 'Firma / Kişi', 'Vade', 'Tutar'] },
    { id: 'receivables', title: 'Alacak Listesi', path: '/finans/alacaklar', description: 'Alacak kayıtlarını bu alanda görüntüleyin.', columns: ['Kayıt No', 'Firma / Kişi', 'Vade', 'Tutar'] },
    { id: 'expenses', title: 'Genel Giderler', path: '/finans/genel-giderler', description: 'Atölyeye ait genel gider kayıtlarını görüntüleyin.', columns: ['Kayıt No', 'Gider Adı', 'Tarih', 'Tutar'] },
  ] },
  { title: 'Raporlama', symbol: 'reports', pages: [
    { id: 'stock-report', title: 'Stok Raporu', path: '/raporlama/stok', description: 'Stok raporları bu alanda yer alacak.', columns: ['Dönem', 'Rapor Adı', 'Oluşturulma Tarihi', 'Durum'] },
    { id: 'production-report', title: 'Üretim Raporu', path: '/raporlama/uretim', description: 'Üretim raporları bu alanda yer alacak.', columns: ['Dönem', 'Rapor Adı', 'Oluşturulma Tarihi', 'Durum'] },
    { id: 'sales-report', title: 'Satış Raporu', path: '/raporlama/satis', description: 'Satış raporları bu alanda yer alacak.', columns: ['Dönem', 'Rapor Adı', 'Oluşturulma Tarihi', 'Durum'] },
    { id: 'finance-report', title: 'Finans Raporu', path: '/raporlama/finans', description: 'Finans raporları bu alanda yer alacak.', columns: ['Dönem', 'Rapor Adı', 'Oluşturulma Tarihi', 'Durum'] },
    { id: 'account-report', title: 'Cari Raporu', path: '/raporlama/cari', description: 'Cari hesap raporları bu alanda yer alacak.', columns: ['Dönem', 'Rapor Adı', 'Oluşturulma Tarihi', 'Durum'] },
  ] },
];

export const pages = navigation.flatMap((group) => group.pages);
