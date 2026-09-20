# Argent Tekstil · Atölye Yönetimi

React, TypeScript ve Vite ile hazırlanmış Türkçe atölye yönetim uygulaması. İlk kullanılabilir sürüm; yerel tarayıcı verisiyle çalışır.

## Yerelde çalıştırma

Node.js 22.18+ veya 24 LTS ile:

```sh
npm install
npm run dev
```

Terminalde gösterilen adresi açın (varsayılan: http://localhost:5173/argent-tekstil-yonetim/).

```sh
npm run typecheck
npm run check
npm run build
npm run preview
```

`preview`, derlenen uygulamayı varsayılan olarak http://localhost:4173/argent-tekstil-yonetim/ adresinde sunar.

## Dosya yapısı

- `src/app/`: Menü tanımları, uygulama ve yönlendirmeler.
- `src/components/`: Ortak sidebar/header düzeni, tablo ve SVG ikonları.
- `src/features/home/`: Beş küçük durum özeti.
- `src/features/shared/`: Form, tablo, veri yükleme ve modül hata sınırı bileşenleri.
- `src/features/inventory/`, `production/`, `sales/`, `finance/`, `reports/`: Modül ekranları.
- `src/domain/`: Modeller, doğrulamalar, cari ve rapor hesapları.
- `src/data/contacts/`, `products/`, `inventory/`, `production/`, `finance/`: Repository ve servis katmanları.
- `src/data/shared/`: Sürümlü localStorage okuma/yazma ve işlem kilitleri.
- `src/data/reports/`: Kaynakları bağımsız okuyan, salt okunur rapor veri servisi.
- `src/styles/`: Ortak tema ve responsive düzen.
- `scripts/`: Menü, modül ve uçtan uca iş akışı testleri.

## Kapsam ve geliştirme

Firma / Kişiler korunmuştur. Ürün stokları satış ve üretim aktarımı için genişletilmiştir. Kumaş, malzeme, makine, üretim planları, iş kartları/aşamalar, fason takibi, satış, finans, raporlar ve ana sayfa özeti işlevseldir. Para Hareketleri aynı ekranın Yapılan / Alınan Ödemeler sekmeleridir; mevcut menü adresleri korunur.

### Temel kullanım sırası

1. Firma / Kişiler'de tedarikçi, fasoncu ve müşteri rollerini tanımlayın.
2. Stok menüsünden alım girin. Cari istiyorsanız Evet ve ilgili işlem türünü seçin.
3. Üretim planı açın; renk adetlerini toplamla eşitleyin ve Üretime Başlat'a basın.
4. İş kartında aşama ekleyin. Birden fazla işlem seçilebilir; verilen adet sınırı her işlem için ayrıdır.
5. Geri gelen toplam adetleri güncelleyin. Dış atölye işi Tamamlandı olduğunda kaynak kayıttan otomatik cari borç görünür. Kendi Atölyemiz cari oluşturmaz.
6. Üretimi tamamlayın: renk bazında sağlam adetleri ve toplam fireyi girin. Sağlam + fire iş adedine eşit olmalıdır. Yalnız sağlam ürünler stoğa girer.
7. Ürün stok listesindeki Satış Yap / Stok Çıkışı ile satış yapın. Stoktan fazla satış engellenir. Açığa satış için sorumlu kişi zorunludur.
8. Cari Hesap veya Para Hareketleri'nden ödeme/tahsilat girin. Aynı kayıt iki ekranda görünür.

### Veri tutarlılığı ve finans

- Firma ilişkileri mevcut Firma ID'sini kullanır. Açığa satış sabit sistem hesabıdır; sorumlular ayrı ID'lerle izlenir.
- Plan başlatma tekrarlandığında ikinci iş kartı açılmaz. Üretim aşaması ve dış fason iş emri aynı kayıttır; ayrı kopya tutulmaz.
- Stok çıkışı, satış ve satışın cari kaynağı ürün belgesinde tek yazımla saklanır. Üretim tamamlanması da stok girişleriyle aynı belgede, iş ID'sine göre bir kez saklanır; yeniden deneme stok çoğaltmaz.
- İş kartı ürün bilgilerini plandan okur. Stoğa aktarım ürün ID'sini korur. Satış maliyeti işlem anındaki parti maliyetinin tarihsel değeridir.
- Cari hareketler alım, onaylı fason, satış, ödeme, manuel borç ve mahsup kaynaklarından ID ile türetilir. Toplam bakiye veya borç/alacak listeleri ayrıca saklanmaz.
- Borç bizim yükümlülüğümüz, alacak bize ödenecek tutardır. Firma bazında karşılıklı net bakiye kullanılır. Alacağı aşan mahsup borca, borcu aşan ödeme alacağa dönüşür.
- Borç/Alacak listeleri en eski açık kaynak önce kapanacak şekilde hesaplanır. Aynı tarihli kaynakların sırası ID ile kararlıdır.
- Genel gider formu ödenmiş genel gideri kaydeder; otomatik ikinci ödeme/cari kaydı yaratmaz. Stok alımı gider değildir; fasoncuya ödeme fason maliyetini yeniden giderleştirmez.
- Tutarlar TL, kayıtlı parasal değerler tam sayı kuruştur. Kumaş/kg ve uygun malzeme birimleri 3 ondalığa kadar desteklenir.
- Her domain ayrı storage anahtarındadır. Bozuk bir veri kaynağının üzerine yazılmaz; raporlar eksik kaynakları açıkça bildirir. Ana sayfa eksik kaynakta yanıltıcı toplam göstermez.
- Web Locks destekleyen tarayıcılarda aynı adresin farklı sekmelerindeki yazımlar sıralanır. Desteklemeyen tarayıcılarda aynı sekme içi kuyruk kullanılır; bu ortamda tek sekmeyle çalışın.

Depolama anahtarları: `argent-tekstil.contacts.v1`, `products.v1`, `fabrics.v1`, `materials.v1`, `machines.v1`, `production.v1`, `finance.v1` (tümü `argent-tekstil.` önekiyle). Önceki firma/ürün anahtarları korunur; yeni ürün alanları isteğe bağlı eklenir, kayıtlar sıfırlanmaz.

### İlk sürüm sınırları

- Veriler aynı tarayıcı/site adresine bağlıdır; cihazlar arası eşitleme, sunucu ve kullanıcı yetkilendirmesi yoktur.
- Üretim birim maliyeti aşama maliyetleri / sağlam adet üzerinden hesaplanır. Kumaş ve malzeme tüketimini üretime otomatik dağıtma bu kapsamda eklenmemiştir.
- Çok işlemli aşamadaki ürünler aynı fiziksel parti kabul edilir. Verilen/dışarıdaki toplam adet işlem adetlerinin toplamı değil, en yüksek verilen/kalan miktardır; işlem bazındaki adetler ayrıca gösterilir.
- Stok raporunda kalan bitiş tarihi itibarıyla, ürün giriş/çıkışları tarih aralığında hesaplanır. Finans kapanış bakiyesi dönem öncesi hareketleri içerir. Ürüne dağıtılmamış ödemelere ürün filtresi uygulanmaz.
- PDF/Excel dışa aktarma ve detaylı makine bakım geçmişi eklenmemiştir. Rapor hesapları UI'dan ayrı olduğundan dışa aktarma sonradan eklenebilir.

### Stoktaki Ürünler

- `src/features/products/`: Stok modelleri, doğrulamalar, liste/filtreler, giriş, düzeltme, iade ve hareket geçmişi ekranları; modüle özel stiller.
- `src/data/products/`: Repository sözleşmesi ve localStorage adaptörü. Firma kayıtları mevcut `contactRepository` üzerinden okunur; kopyalanmaz.
- `scripts/check-products.ts`: Paket/adet hesabı, asorti, partiler, düzeltme, iade, cari ilişki, filtre ve hata testleri (`npm run test:products`).

Veriler `argent-tekstil.products.v1` anahtarında saklanır. Stok ve ilgili hareketler tek belge olarak yazılır; depolama hatasında kısmi işlem oluşmaz. Partiler kayıt sırasında otomatik numaralanır. Mevcut partiyi seçerek aynı ürün/marka için farklı renk ve asorti satırları açılabilir.

Adet hesabı paket içeriği × paket sayısıdır; manuel adet de girilebilir. Liste mevcut adetten hesaplanan tam paket sayısını ve kalan tek adedi gösterir. Girişte bildirilen paket sayısı detayda korunur. Seri/asorti metni hesaplamaya katılmaz. Birim maliyet TL/adet olarak alınır; tutarlar tam sayı kuruşla saklanır.

Yeni stok girişindeki İade stoğa ekler (geri gelen ürün); mevcut kayıttaki İade tedarikçiye çıkıştır. Düzeltme/iade sonrası stok negatif olamaz; hareket tarihi önceki hareketten geriye alınamaz. Pasif kayıtlar silinmez; işlem yapmak için yeniden aktif hale getirilir.

Eski ürün alım/iade cari kaynakları aynen korunur. Önceki sürümün `pending` alanı geriye uyumluluk için kalır; artık cari hesap seçicisi bu kaynakları doğrudan hesaba katar, ayrıca aktarım veya kopyalama yapmaz. Hareket geçmişinden ilgili cari hesaba ulaşılabilir.

### Firma / Kişiler

- `src/features/contacts/`: Veri modeli, doğrulama, liste, form, detay ekranı ve modüle özel stiller.
- `src/data/contacts/repository.ts`: Asenkron listeleme, tek kayıt okuma, oluşturma ve düzenleme sözleşmesi.
- `src/data/contacts/localStorageRepository.ts`: Sürümlü localStorage adaptörü; depolama hatalarını bildirir ve okunamayan verilerin üzerine yazmaz.
- `src/data/contacts/index.ts`: Gelecekte Supabase veya başka bir repository seçilecek nokta.
- `scripts/check-contacts.ts`: Kalıcılık, düzenleme, çoklu rol, filtre, doğrulama ve depolama hata testleri (`npm run test:contacts`).

Ad/unvan ve en az bir rol zorunludur. Telefon, e-posta ve vergi/T.C. numarası girilirse biçimi doğrulanır; vergi/T.C. numarası için resmi kimlik doğrulaması yapılmaz. Fasoncu rolü kaldırılınca fason hizmetleri temizlenir. Fatura bilgileri ve fason hizmetleri isteğe bağlıdır.

Kayıtlar `argent-tekstil.contacts.v1` anahtarında aynı tarayıcı ve site adresi için saklanır; sayfa yenilendiğinde korunur. Tarayıcı verileri temizlenirse silinir, cihazlar arasında eşitlenmez. `localhost` ve `127.0.0.1` farklı depolama alanlarıdır; aynı adresi kullanın. Form ve detay ekranları `/#/firma-kisiler?islem=...` adresleriyle açılır.

Yeni modül için `src/features/<modul>/` altında bileşenleri oluşturun; `src/app/navigation.ts` içine menü tanımı ekleyin ve `src/app/App.tsx` içinde sayfasını bağlayın. Ortak form/tablo/hata bileşenleri `features/shared` altındadır.

Veritabanı seçilince ilgili domain repository metotlarını uygulayan adaptörleri `src/data/<domain>/index.ts` üzerinden bağlayın. Satış ve üretim aktarımının atomiklik/idempotency kurallarını backend işlemlerinde koruyun. Cari/rapor seçicileri saf fonksiyonlardır. Bileşenlerde localStorage veya veritabanı sorgusu bulunmaz. `src/data/mock` ilk iskeletin kullanılmayan genişletme örneği olarak kalır.

### Kontroller

`npm run check` menü kontrolüyle beraber firma, ürün, envanter, üretim, satış, finans, rapor ve uçtan uca testlerini çalıştırır. Testler yalnız bellek içi storage kullanır; tarayıcıya test kaydı eklemez. `npm run typecheck` ve `npm run build` ayrıca çalıştırılabilir.

Uçtan uca senaryolar: dört alım türü, işlem bazında adet sınırı, 493 sağlam/7 fire aktarımı, fazla satış engeli, açığa satış sorumlusu/tahsilatı, tek cari kaynak, depolama hatasında kısmi yazım olmaması, tekrar aktarım ve eşzamanlı fason limiti.

## GitHub Pages yayını

Vite `base` ayarı `/argent-tekstil-yonetim/` olarak yapılandırılmıştır. Mevcut `HashRouter` korunur: örnek adres `/argent-tekstil-yonetim/#/stok/urunler`. Hash sonrasındaki rota sunucuya gönderilmediğinden alt sayfa yenilemeleri için `404.html` yönlendirmesi gerekmez.

1. Repository **Settings → Pages → Build and deployment → Source** alanında **GitHub Actions** seçin.
2. Dosyaları kendiniz `main` dalına push edin. `.github/workflows/deploy-pages.yml` otomatik çalışır; Actions sekmesinden elle de başlatılabilir.
3. Workflow Node.js 24 ile `npm ci`, `npm run check` ve `npm run build` çalıştırır; `dist` klasörünü Pages'e yayınlar. Deploy yalnızca `main` dalında yapılır.

Yayın adresi: https://kerem3409.github.io/argent-tekstil-yonetim/

Bu hazırlık sırasında GitHub'a push veya yayın yapılmadı. Yereldeki localStorage kayıtları GitHub Pages'e taşınmaz; farklı site adresi ayrı depolama kullanır.
