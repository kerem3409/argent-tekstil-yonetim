import type { Contact, ContactInput } from '../../features/contacts/model';

export interface ContactRepository {
  list(): Promise<Contact[]>;
  get(id: string): Promise<Contact | null>;
  create(input: ContactInput): Promise<Contact>;
  update(id: string, input: ContactInput): Promise<Contact>;
}
