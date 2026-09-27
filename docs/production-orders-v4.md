# Sipariş ve üretim akışı (v4)

Her `ProductionOrder` tek bir `product` taşır. Müşteri, termin ve sipariş notları ana kayıtta; renkler, ortak seri, nakış teknik bilgileri, paket bilgileri ve aşamalar ürün üzerinde tutulur. Marka kayıtları `productionBrands` içinde saklanır. Hazır Markasız seçeneği yoktur.

ARGENT, `system:argent-internal-customer` kimliği ile tanınır. Aynı isimdeki başka müşteriler iç müşteri sayılmaz. Müşteri profilleri aynı sipariş deposunu okur.

Kesim sonucu hedefi aşabilir. Sonraki aşamalar önceki sonucu başlangıç olarak kullanır; sonuç başlangıcı aşamaz. Tamamlanan bütün müşteri siparişleri mevcut stok alım API'sini kullanır. Stok kaynağı kimliği yeniden denemelerde değişmez. Stok makbuzu oluşup sipariş yazımı başarısız olsa da okumada makbuzdan stok durumu toparlanır.

## Taslak, föy ve bölüm kaydı

Eksik formlar `argent-tekstil.order-drafts.v1` anahtarında otomatik kaydedilir. Taslaklar sipariş ve müşteri sayılarına girmez. `sourceDraftId`, kaydetme tekrarlandığında aynı siparişi döndürür; dönüştürülen taslak geçmişi saklanır fakat taslak listesinde gösterilmez. Revizyon kontrolü başka sekmedeki değişikliği sessizce ezmeyi önler. Depolama hatası formda açıkça gösterilir.

Föyler salt okunur çıktılardır. Genel föy iç kullanım içindir; Kesim/Nakış/Dikim/Ütü-Paket föyleri müşteri ve genel sipariş notlarını almaz. Üretim öncesinde gerçek başlangıç miktarı yoksa planlanan miktar açıkça etiketlenir.

`productionStartedAt` aynı siparişte üretimi başlatır. Eski aşaması bulunan kayıtlar ek işleme gerek duymadan devam eder. `saveStage` firma, tarihler ve bütün renk sonuçlarını tek işlemde kaydeder. Sonuç tarihleri renk bazında tutulur; aşama tarihi son renk tarihidir. Tamamlanmış sonuçlar kilitlidir. Kaydedilmemiş aşama girişleri sayfadan ayrılırken uyarılır.

Fire = başlangıç − çıkan. Pozitif üretim farkı `+N adet` gösterilir. Üretim özeti her renk ve aşamanın çıktısını/firesini toplar; siparişe göre eksik miktarı ayrıca gösterir. Üretim tamamlanması ile stoğa aktarım ayrı durumlardır. Mevcut satış/çıkış modülü değişmemiştir.

## Eski kayıtlar

Depolama anahtarı değişmez: `argent-tekstil.production.v1`. Kaynak plan, kesim ve üretim kayıtları silinmez. Önceki dönüşüm üzerinden her eski ürün deterministik kimlikle ayrı v4 sipariş olarak gösterilir. Okuma sırasında depoya yazılmaz. Sipariş değiştirildiğinde v4 kaydı eklenir; kaynak ham kayıtlar korunur.

Eski planın ürünleri ayrı siparişlere ayrıldığından bir siparişin arşiv/çöp işlemi kardeş siparişleri etkilemez. Aşama geçmişi siparişle birlikte saklanır. Önceki stok kaynağı kimliği korunur. Karmaşık eski mali/üretim geçmişi salt okunur gösterilir. Dönüştürülemeyen kayıt için uyarı gösterilir; bozuk depo üzerine yazılmaz.

Eski plan, kesim takibi ve üretim kartı adresleri siparişlere yönlendirilir. Eski alan kodları veri uyumluluğu ve regresyon testleri için korunur; yeni menüde açılmaz.

## Kontrol

`check-production-orders.ts` tek ürün, marka, miktar, stok tekrar güvenliği ve migration kontrollerini kapsar. `check-order-form.mjs` gerçek React ekranlarında müşteri profili, sipariş açma, teknik çıktı, aşamalar ve arşiv/PIN/geri yükleme işlemlerini kontrol eder. Testlerin localStorage ortamı kullanıcı tarayıcısından ayrıdır.
