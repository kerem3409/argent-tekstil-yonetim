# Üretim Planı — workflowVersion 3

Üretim menüsü Üretim Planları, Arşiv ve Çöp Kutusundan oluşur. Plan bazlı ve ürün kalemi bazlı listeler aynı plan/ürün detayını açar. Yeni kayıtlarda kesim emri veya ayrı üretim kartı oluşturulmaz.

## Veri

Mevcut `argent-tekstil.production.v1` belgesine `unifiedPlans` ve `nextUnifiedPlan` eklenir. `ProductionPlan` genel bilgileri, `PlanItem` ürün bilgilerini ve `PlanStageRecord` aşama sonuçlarını saklar. Plan numarası `UP-001` biçimindedir. Ürün kimliği bütün aşamalarda değişmez.

ARGENT müşterisinin sabit kimliği `system:argent-internal-customer` değeridir. Aynı adı taşıyan normal bir müşteri stok üretimi sayılmaz. Bu sistem seçeneği yalnız üretim modülünde sunulur; müşteri deposuna otomatik kayıt eklenmez.

Kesim zorunludur; Nakış ve Baskı opsiyoneldir; Dikim ve Ütü/Paket zorunludur. Bir önceki aşamanın kaydedilen sonucu sonraki aşamanın başlangıcıdır. Kesimde fazla çıktı kabul edilir; diğer aşamalar başlangıç miktarıyla sınırlıdır. Sıfır çıktı korunur. Sonuçlar kaydedildikten sonra değişmez. Eşzamanlı yazımlar mevcut depo kilidi ve plan revizyonuyla korunur.

## Eski kayıtlar

Dönüşüm deterministik ve ilk okumada yazmasızdır. Eski sipariş bir plan, mevcut sipariş kalemi aynı kimlikte ürün olur. Stok siparişleri ARGENT kimliğine bağlanır. Kaynak siparişler, kesim kayıtları, üretimler ve mali aşamalar silinmez.

Kesim sonucu güvenle eşleştirilebiliyorsa yeni aşamalar aynı kalem üzerinden sürdürülebilir. Farklı markalara/serilere bölünmüş kayıtlar, mali veya devam eden eski aşamalar ve tamamlanmış üretimler geçmiş görünümünde salt okunur korunur. Eksik müşteri/termin/marka alanları uydurulmaz. Eski numaralar korunur. İlk değişiklik yeni plan görünümünü aynı belgeye kaydeder; geçmiş ham kayıtlar yalnız arşiv/çöp yaşam döngüsü bilgileri için güncellenir.

Eski adresler yeni plan detayına yönlenir. Geçmiş tamamlanmış ARGENT üretimlerinde mevcut stok aktarımı kullanılabilir. Yeni ARGENT ürünleri mevcut `receiveProduction` arayüzüne sabit ürün/plan kaynak kimliğiyle aktarılır. Tekrar deneme stok çoğaltmaz. Malzeme listesi teknik bilgidir; otomatik malzeme çıkışı veya mali hareket üretmez.

## Çıktılar

Kesim ve nakış çıktıları yalnız açıkça seçilmiş teknik alanlardan oluşur. Müşteri kimliği, adı, iletişim bilgileri, müşteri referansı, genel plan notu ve mali alanlar aktarılmaz. Çıktı açmak/yazdırmak depoya yazmaz ve aşamayı başlatmaz.

## Kontroller

`check-production-plans.ts` miktar zinciri, müşteri kimliği, çok kalemli plan, migration, arşiv/PIN, eşzamanlı yazım ve mevcut stok deposuna aktarımı doğrular. `check-order-form.mjs` uygulamanın gerçek yeni formlarını, iki liste görünümünü, teknik çıktıları ve tek detay akışını çalıştırır. Eski repository ve föy testleri geçmiş veri uyumluluğu için korunur.
