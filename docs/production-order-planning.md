# Sipariş üretim planlaması — workflowVersion 4

Her sipariş tek ürün içerir. Üretim Planları ekranında aşamaların firma, planlanan başlangıç ve termin bilgileri sonuç girilmeden kaydedilebilir. Yeni firma ilgili fason hizmetiyle oluşturulur. Genel sipariş termini ayrı tutulur.

Aşamalar sırayla başlatılır; önceki aşamanın sonucu sonraki aşamanın başlangıç miktarıdır. Kesimde fazla çıktı kabul edilir. Diğer aşamaların çıktısı başlangıç miktarını aşamaz. Sonuç tarihi İstanbul takvimine göre otomatik kaydedilir. Renkler, adetler ve kesimde top/kg aynı tabloda gösterilir.

Kaydedilmiş miktarın değiştirilmesi sonraki aşama varsa onay ister. Sonraki sonuç yeni başlangıcı aşıyorsa işlem bütünüyle reddedilir. Önceki sonuç geçmişte saklanır. Stok aktarımından sonra adetler kilitlenir; notlar, plan bilgileri ve top/kg düzenlenebilir.

Canlı Üretim, aktif siparişleri ürün tanımı ve mevcut aşama bazında toplar. Arşivlenen, silinen ve tamamlanan kayıtlar toplama girmez. Ürün detayından kaynak siparişe geçilebilir.

Arşivde Tümünü Seç yalnızca filtrelerle görünen kayıtları seçer. Toplu geri alma ve PIN ile çöp kutusuna taşıma atomiktir; eski revizyon veya yanlış PIN hiçbir kaydı değiştirmez. Kalıcı silme yapılmaz.

Siparişin baskı bilgileri, düşük omuz ve yırtmaç seçenekleri saklanır. Teknik föyler güncel plan ve sonuç bilgilerini gösterir; genel sipariş föyü dışındaki teknik çıktılara müşteri ve mali bilgiler aktarılmaz.

Kontroller: `npm test`, `npm run typecheck`, `npm run build`. Gerçek React form testleri planlama, firma ekleme, aşama başlatma, miktar düzeltme, föyler, canlı toplamlar ve toplu arşiv akışını çalıştırır.
