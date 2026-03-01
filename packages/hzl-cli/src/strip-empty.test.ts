import { describe, it, expect } from 'vitest';
import { stripEmptyCollections } from './strip-empty.js';

describe('stripEmptyCollections', () => {
  it('strips empty arrays', () => {
    expect(stripEmptyCollections({ tags: [], title: 'foo' })).toEqual({ title: 'foo' });
  });

  it('strips empty objects', () => {
    expect(stripEmptyCollections({ metadata: {}, title: 'foo' })).toEqual({ title: 'foo' });
  });

  it('keeps non-empty arrays', () => {
    expect(stripEmptyCollections({ tags: ['a'], title: 'foo' })).toEqual({ tags: ['a'], title: 'foo' });
  });

  it('keeps non-empty objects', () => {
    expect(stripEmptyCollections({ metadata: { k: 'v' }, title: 'foo' })).toEqual({ metadata: { k: 'v' }, title: 'foo' });
  });

  it('keeps null values', () => {
    expect(stripEmptyCollections({ agent: null, title: 'foo' })).toEqual({ agent: null, title: 'foo' });
  });

  it('keeps scalar values', () => {
    expect(stripEmptyCollections({ priority: 0, done: false, title: '' })).toEqual({ priority: 0, done: false, title: '' });
  });

  it('does not recurse into nested objects', () => {
    expect(stripEmptyCollections({ nested: { tags: [] } })).toEqual({ nested: { tags: [] } });
  });
});
