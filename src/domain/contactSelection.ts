import type { Contact, ContactRole, SubcontractService } from '../features/contacts/model';

export const normalizedContactName = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
export function selectableContacts(contacts: Contact[], role?: ContactRole, service?: SubcontractService) {
  return contacts.filter((contact) => contact.status === 'Aktif' && (!role || contact.roles.includes(role)) && (!service || (contact.roles.includes('Fasoncu') && contact.services.includes(service))));
}
