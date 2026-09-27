# Sipariş ve üretim akışı (v4)

Her `ProductionOrder` tek bir `product` taşır. Müşteri, termin ve sipariş notları ana kayıtta; renkler, ortak seri, nakış teknik bilgileri, paket bilgileri ve aşamalar ürün üzerinde tutulur. Marka kayıtları `productionBrands` içinde saklanır. Hazır Markasız seçeneği yoktur.

ARGENT, `system:argent-internal-customer` kimliği ile tanınır. Aynı isimdeki başka müşteriler stok üretimi sayılmaz. Müşteri profilleri aynı sipariş deposunu okur.

Kesim sonucu hedefi aşabilir. Sonraki aşamalar önceki sonucu başlangıç olarak kullanır; sonuç başlangıcı aşamaz. Tamamlanan ARGENT siparişleri mevcut stok alım API'sini kullanır. Stok kaynağı kimliği yeniden denemelerde değişmez.

## Eski kayıtlar

Depolama anahtarı değişmez: `argent-tekstil.production.v1`. Kaynak plan, kesim ve üretim kayıtları silinmez. Önceki dönüşüm üzerinden her eski ürün deterministik kimlikle ayrı v4 sipariş olarak gösterilir. Okuma sırasında depoya yazılmaz. Sipariş değiştirildiğinde v4 kaydı eklenir; kaynak ham kayıtlar korunur.

Eski planın ürünleri ayrı siparişlere ayrıldığından bir siparişin arşiv/çöp işlemi kardeş siparişleri etkilemez. Aşama geçmişi siparişle birlikte saklanır. Önceki stok kaynağı kimliği korunur. Karmaşık eski mali/üretim geçmişi salt okunur gösterilir. Dönüştürülemeyen kayıt için uyarı gösterilir; bozuk depo üzerine yazılmaz.

Eski plan, kesim takibi ve üretim kartı adresleri siparişlere yönlendirilir. Eski alan kodları veri uyumluluğu ve regresyon testleri için korunur; yeni menüde açılmaz.

## Kontrol

`check-production-orders.ts` tek ürün, marka, miktar, stok tekrar güvenliği ve migration kontrollerini kapsar. `check-order-form.mjs` gerçek React ekranlarında müşteri profili, sipariş açma, teknik çıktı, aşamalar ve arşiv/PIN/geri yükleme işlemlerini kontrol eder. Testlerin localStorage ortamı kullanıcı tarayıcısından ayrıdır.
