import type { CollectionSchema } from 'deepspace/schema'

export const ticketsSchema: CollectionSchema = {
  name: 'tickets',
  ownerField: 'studentId',
  columns: [
    { name: 'sessionId', storage: 'text', interpretation: 'plain' },
    { name: 'studentId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'question', storage: 'text', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['waiting', 'helping', 'done'] } },
    { name: 'groupId', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own', writableFields: ['question'] },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
