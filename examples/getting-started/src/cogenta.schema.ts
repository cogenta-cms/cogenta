import { defineCollection, f, validateCollectionSet } from '@cogenta/schema'

export const note = defineCollection({
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  routing: { pattern: '/notes/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    body: f.richText({ required: true }),
  },
  indexes: [['slug']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

validateCollectionSet([note])

export default [note]
