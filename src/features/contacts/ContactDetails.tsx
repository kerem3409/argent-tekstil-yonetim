import type { Contact } from './model';

export function ContactDetails({ contact }: { contact: Contact }) {
  const sections = [
    { title: 'Temel Bilgiler', fields: [
      ['Kayıt Türü', contact.type], ['Firma / Kişi Adı', contact.name], ['Yetkili', contact.authorizedPerson],
      ['Telefon', contact.phone], ['E-posta', contact.email], ['Durum', contact.status], ['Adres', contact.address], ['Not', contact.note],
    ] },
    { title: 'Fatura Bilgileri', fields: [
      ['Vergi Dairesi', contact.taxOffice], ['Vergi No / T.C. No', contact.taxNumber],
      ['Fatura Adresi', contact.billingAddress], ['E-Fatura / E-Arşiv Durumu', contact.invoiceStatus],
    ] },
    { title: 'Roller ve Hizmetler', fields: [
      ['Roller', contact.roles.join(', ')],
      ...(contact.roles.includes('Fasoncu') ? [['Fason Hizmetleri', contact.services.join(', ')]] : []),
    ] },
  ];
  return <div className="contact-details">{sections.map((section) => <section className="contact-detail-section" key={section.title}><h2>{section.title}</h2><dl className="contact-detail-grid">{section.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Belirtilmedi'}</dd></div>)}</dl></section>)}</div>;
}
