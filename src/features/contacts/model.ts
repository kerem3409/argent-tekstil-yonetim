export const contactRoles = ['Hazır Giyim Tedarikçisi', 'Kumaş Tedarikçisi', 'Malzeme Tedarikçisi', 'Fasoncu', 'Hazır Giyim Müşterisi'] as const;
export const subcontractServices = ['Kesim', 'Nakış', 'Dikim', 'Baskı', 'Ütü & Paket', 'Diğer'] as const;
export type ContactRole = typeof contactRoles[number];
export type SubcontractService = typeof subcontractServices[number];

export interface ContactInput {
  type: 'Firma' | 'Şahıs';
  name: string;
  authorizedPerson: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  taxOffice: string;
  taxNumber: string;
  billingAddress: string;
  invoiceStatus: '' | 'E-Fatura' | 'E-Arşiv';
  roles: ContactRole[];
  services: SubcontractService[];
  status: 'Aktif' | 'Pasif';
}

export interface Contact extends ContactInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export const emptyContact: ContactInput = {
  type: 'Firma', name: '', authorizedPerson: '', phone: '', email: '', address: '', note: '',
  taxOffice: '', taxNumber: '', billingAddress: '', invoiceStatus: '', roles: [], services: [], status: 'Aktif',
};

export type ContactErrors = Partial<Record<keyof ContactInput, string>>;

export function normalizeContact(input: ContactInput): ContactInput {
  return {
    type: input.type, name: input.name.trim(), authorizedPerson: input.authorizedPerson.trim(),
    phone: input.phone.trim(), email: input.email.trim(), address: input.address.trim(), note: input.note.trim(),
    taxOffice: input.taxOffice.trim(), taxNumber: input.taxNumber.trim(), billingAddress: input.billingAddress.trim(),
    invoiceStatus: input.invoiceStatus, roles: [...new Set(input.roles)],
    services: input.roles.includes('Fasoncu') ? [...new Set(input.services)] : [], status: input.status,
  };
}

export function validateContact(input: ContactInput): ContactErrors {
  const errors: ContactErrors = {};
  if (!['Firma', 'Şahıs'].includes(input.type)) errors.type = 'Geçerli bir kayıt türü seçin.';
  if (input.name.trim().length < 2) errors.name = 'En az 2 karakter içeren bir ad / unvan girin.';
  const limits = { name: 200, authorizedPerson: 150, phone: 30, email: 254, address: 1000, note: 2000, taxOffice: 150, billingAddress: 1000 } as const;
  for (const [field, limit] of Object.entries(limits)) {
    const key = field as keyof typeof limits;
    if (input[key].length > limit) errors[key] = `En fazla ${limit} karakter girin.`;
  }
  if (input.phone.trim() && (!/^\+?[\d\s().-]+$/.test(input.phone.trim()) || !/^\d{10,15}$/.test(input.phone.replace(/\D/g, '')))) {
    errors.phone = 'Telefon 10–15 rakam içermeli; +, boşluk, parantez ve tire kullanılabilir.';
  }
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = 'Geçerli bir e-posta adresi girin.';
  if (input.taxNumber.trim() && !/^\d{10,11}$/.test(input.taxNumber.trim())) errors.taxNumber = 'Vergi no 10, T.C. no 11 rakam olmalıdır.';
  if (!input.roles.length || input.roles.some((role) => !contactRoles.includes(role))) errors.roles = 'En az bir rol seçin.';
  if (input.services.some((service) => !subcontractServices.includes(service))) errors.services = 'Geçerli bir fason hizmeti seçin.';
  if (!['', 'E-Fatura', 'E-Arşiv'].includes(input.invoiceStatus)) errors.invoiceStatus = 'Geçerli bir fatura durumu seçin.';
  if (!['Aktif', 'Pasif'].includes(input.status)) errors.status = 'Aktif veya Pasif seçin.';
  return errors;
}

export function filterContacts(contacts: Contact[], query: string, role: string): Contact[] {
  const term = query.trim().toLocaleLowerCase('tr-TR');
  const digits = term.replace(/\D/g, '');
  return contacts.filter((contact) => {
    const textMatch = [contact.name, contact.authorizedPerson, contact.phone, contact.email]
      .some((value) => value.toLocaleLowerCase('tr-TR').includes(term));
    const phoneMatch = digits.length > 0 && /^[\d\s+().-]+$/.test(term) && contact.phone.replace(/\D/g, '').includes(digits);
    return (textMatch || phoneMatch) && (!role || contact.roles.some((item) => item === role));
  });
}
