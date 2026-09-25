# Üretim kaydı ve uyumluluk

Üretim menüsü: Sipariş Kartları, Üretim Takibi, Tamamlanan Üretimler, Arşivlenen Siparişler. Ana menü grupları ilk açılışta kapalıdır.

## Sipariş ve kesime hazırlık

Sipariş Kartı → Sipariş Kalemi → Üretim Kartı bağlantısı korunur. Bir kalem farklı markalara ve miktarlara bölünebilir; renk/adet rezervasyon kontrolleri değişmemiştir.

- `archived` ve `archivedAt` siparişin üzerinde tutulur. Arşive At / Arşivden Çıkar işlemleri revizyon kontrolüyle çalışır; üretim kayıtlarını ve bağlantılarını değiştirmez. Kalıcı silme yoktur.
- İsteğe bağlı `dueDate` termin tarihidir. Sipariş listesi, sipariş detayı ve ilgili üretim takibinde aynı sipariş kaynağından gösterilir. Termin değişince üretimlere kopyalama gerekmez.
- Liste `createdAt` azalan sıralıdır; eski eksik/geçersiz zaman damgasında sipariş tarihi, eşitlikte sipariş numarası kullanılır. Güncelleme ve arşivden çıkarma oluşturulma zamanını değiştirmez.
- Yeni alanların bulunmadığı kayıtlar aktif ve terminsiz kabul edilir. Salt okuma veya sıralama depolamaya yazmaz; toplu migration/reset yoktur. Eski türetilmiş sipariş arşivlendiğinde mevcut deterministik kimliğiyle saklanır.
- Firma / Kişiler → Müşteriler, aynı contact repository üzerinde Hazır Giyim Müşterisi rolünü filtreler. Pasif ve çok rollü müşteriler de yönetilebilir. Sipariş seçicisi aynı kayıtların aktif olanlarını kullanır.
- `sizeDistribution` ortak pastal mantığı korunur. Oluşturma/düzenlemede yatay beden başlıkları ve hemen altında küçük girişler, detayda tek satır değerler gösterilir. Dar ekranda bu bölüm kendi içinde kayar.
- Kesime Föy Hazırla, üretim kartındaki ayrılmış renk/adetlerden salt okunur A4 çalışma kağıdı oluşturur. Sipariş/müşteri, marka, ürün, kumaş, talimatlar ve ortak pastal bir kez gösterilir. Top Sayısı / Kg / Çıkan Adet hücreleri geçmiş sonuç bulunsa dahi boş basılır. Eski kayıtta istenen adet yoksa gerçek kesim adedi yerine belirtilmemiş yazılır.
- Yeni kesim satırlarının top/kg/adet alanları `null` başlar. Kesim Sonucu Gir ayrı bir işlemdir; sonuç kaydında gerekli alanlar doğrulanır. Föy açmak kayıt oluşturmaz veya üretim revizyonunu değiştirmez.

## Kalıcı veri

Mevcut `argent-tekstil.production.v1` localStorage belgesi korunur. Belgeye isteğe bağlı `productions` ve `nextProduction` eklenir. `plans`, `jobs`, `stages`, eski sayaçlar ve tanınmayan alanlar silinmez. Örnek veri veya depolama sıfırlaması yoktur.

`ProductionRecord` bir üretimin ürün tanımı, kumaş, gramaj, beden serisi, kesim şekli, kesimci, tarih ve talimat bilgilerini taşır. Otomatik numara `UR-00001` biçimindedir.

- `cuttingSheet.brandSections`: marka başlığı altında kalıcı kimlikli renk/top/kg/adet satırları. Boş kg/adet `null` olarak saklanır; sıfır sonuçla karıştırılmaz.
- `sizeDistributions`: kesim satırı kimliği ve beden→adet sözlüğü. Her satırın beden toplamı kesim adediyle eşleşir.
- `productionStages`: aynı üretimde ayrı fason/atölye hareketleri. Tutarlar kuruş cinsindendir. Kalan adet depolanmaz, gönderilen−gelen olarak hesaplanır.
- `completion`: marka/renk satırı ve beden bazında sağlam/fire sonuçları, toplamlar, tarih ve not.
- `stockTransfer`: stok kimlikleri ve tarih. Aktarım yalnızca sağlam adetleri içerir.
- `revision`: eski ekrandan veya farklı sekmeden yapılan çakışan yazımları engeller.

Kayıtlar silinmez. Kesim sonuç onayı, aşama onayı ve üretim tamamlaması sonrasında ilgili alanlar kilitlenir. Taslak marka/renk kaldırma işlemi kullanıcıya açıkça onaylatılır.

## Eski kayıtlar

`normalizeProductions` eski plan ve iş kartını deterministik `legacy:<planId>` kimliğiyle birleştirir. İlk okuma depoya yazmaz. İlk güncellemede yeni görünüm `productions` dizisine eklenir; eski ham diziler korunur. Eski iş kartı ve aşama kimlikleri aynı kalır.

Eski veri gerçek kesim kg/top/beden içermiyorsa bunlar uydurulmaz: kg/top `null`, beden dağılımı boş olur. Başlamış eski işlerde mevcut renk miktarları başlangıç miktarıdır; ekran bu durumu açıklar. Başlamamış eski planlarda kesim föyü doldurulur. Eski beden serisi bilinmediği için görüntüde belirtilmemiş olarak işaretlenir; isteğe bağlı dağılım ekranında Yetişkin serisi kullanılır. Dağılımı olmayan eski iş, beden atanmadan tamamlanabilir. Orijinal plan durumu, teslim tarihi ve diğer alanlar ham kayıtta korunur.

Eski `/uretim/plan` ve `/uretim/devam-eden?is=...` bağlantıları yeni ekranları açar. Eski ekran dosyaları uyumluluk amacıyla depoda kalır ancak menüden/yönlendirmeden kullanılmaz.

## Finans, raporlar ve stok

`projectWorkflow` yeni üretimleri mevcut plan/iş/aşama okuma sözleşmesine dönüştürür. Bu görünüm depolanmaz. Taşınmış eski kayıtların ham kopyaları aynı anda raporlanmaz; çift sayım önlenir.

Fason Takibi üretim hareketlerinden türetilir, ikinci kayıt sistemi değildir. Finansın mevcut `stage:<id>` kaynak kimliği korunur. Onaylanmış fason bir kez borç olarak görünür; kendi atölyemiz için şirket kimliği boştur ve cari hareket yoktur.

Stoğa aktarım mevcut `receiveProduction` işlemini kullanır. Stok kaydında ürün tanımı, üretim no, üretim satırı, marka, renk, beden, kumaş ve gramaj korunur. Teknik stok gruplaması içeridedir; üretim arayüzünde parti alanı yoktur.

Üretim ve stok belgeleri arasında tek localStorage transaction bulunmadığından stok makbuzu yetkili aktarım kanıtıdır. Stok yazılıp üretim yazılamazsa sonraki okuma makbuzdan Tamamlandı durumunu kurar. Tekrar aktarım yeni stok yaratmaz. Aynı üretim kilidi ve stok kilidi tutarlı sırayla kullanılır.

## Taşınabilirlik ve kontroller

Domain: `productionWorkflow.ts`. Kalıcılık/işlemler: `workflowRepository.ts`; StoragePort, firma, ürün tanımı, kumaş ve stok bağımlılıkları dışarıdan verilir. UI localStorage'a doğrudan erişmez. Veritabanına geçişte aynı sözleşmeler korunabilir; aktarım makbuzu kimliğine benzersizlik kısıtı eklenmelidir.

`npm test`, `npm run check`, `npm run typecheck`, `npm run build` mevcut ve yeni akışları doğrular. `check-production-print.mjs` A4 bileşenlerini sunucuda render eder; CSS A4 sayfa ölçüsü, tekrar eden tablo başlıkları ve satırların bölünmemesini tanımlar. Fiziksel yazıcı çıktısı/render testiyle aynı şey değildir.

## Bu üretim değişikliğinin dosyaları

- `src/domain/productionWorkflow.ts`, `src/domain/production.ts`
- `src/data/production/workflowRepository.ts`, `src/data/production/repository.ts`, `src/data/production/index.ts`
- `src/features/production/ProductionPage.tsx`, `ProductionForms.tsx`, `WorkflowStageForms.tsx`, `ProductionPrint.tsx`, `production.css`
- `src/app/App.tsx`, `src/app/navigation.ts`, `src/features/home/HomePage.tsx`
- `src/features/shared/WorkshopUI.tsx`
- `src/features/products/model.ts`, `src/features/products/StockHistory.tsx`, `src/data/products/localStorageRepository.ts`
- `scripts/check-production-workflow.ts`, `scripts/check-production-print.mjs`, `scripts/check-navigation.ts`, `package.json`
- `docs/production-workflow.md`

Önceki ürün tanımı ve renk dağılımı çalışmalarının yerel değişiklikleri de korunmuştur.
