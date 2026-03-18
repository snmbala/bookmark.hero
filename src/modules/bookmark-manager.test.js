import { describe, it, expect } from 'vitest';
import { filterBookmarks, sortBookmarksByTitle, containsSearchTerm } from './bookmark-manager.js';

describe('Bookmark Manager', () => {
    describe('containsSearchTerm', () => {
        it('should return true if text contains search term', () => {
            expect(containsSearchTerm('Hello World', 'hello')).toBe(true);
            expect(containsSearchTerm('Hello World', 'world')).toBe(true);
        });

        it('should return false if text does not contain search term', () => {
            expect(containsSearchTerm('Hello World', 'foo')).toBe(false);
        });

        it('should be case insensitive', () => {
            expect(containsSearchTerm('Hello World', 'HELLO')).toBe(true);
        });

        it('should handle multiple terms', () => {
            expect(containsSearchTerm('Hello World', 'hello world')).toBe(true);
            expect(containsSearchTerm('Hello World', 'world hello')).toBe(true);
        });
    });

    describe('sortBookmarksByTitle', () => {
        it('should sort bookmarks alphabetically by title', () => {
            const bookmarks = [
                { bookmark: { id: 1, title: 'Zebra' } },
                { bookmark: { id: 2, title: 'Apple' } },
                { bookmark: { id: 3, title: 'Banana' } }
            ];

            const sorted = sortBookmarksByTitle(bookmarks);
            expect(sorted[0].bookmark.id).toBe(2); // Apple
            expect(sorted[1].bookmark.id).toBe(3); // Banana
            expect(sorted[2].bookmark.id).toBe(1); // Zebra
        });
    });

    describe('filterBookmarks', () => {
        const mockBookmarks = [
            { bookmark: { id: 1, title: 'Google', url: 'https://google.com', parentId: '1' } },
            { bookmark: { id: 2, title: 'GitHub', url: 'https://github.com', parentId: '2' } },
            { bookmark: { id: 3, title: 'GitLab', url: 'https://gitlab.com', parentId: '1' } }
        ];

        it('should filter by search term', () => {
            const result = filterBookmarks(mockBookmarks, 'git');
            expect(result.length).toBe(2);
            expect(result.find(b => b.bookmark.id === 2)).toBeTruthy();
            expect(result.find(b => b.bookmark.id === 3)).toBeTruthy();
        });

        it('should filter by folder id', () => {
            const result = filterBookmarks(mockBookmarks, '', ['1']);
            expect(result.length).toBe(2);
            expect(result.find(b => b.bookmark.id === 1)).toBeTruthy();
            expect(result.find(b => b.bookmark.id === 3)).toBeTruthy();
        });

        it('should filter by search term AND folder id', () => {
            const result = filterBookmarks(mockBookmarks, 'git', ['1']);
            expect(result.length).toBe(1);
            expect(result[0].bookmark.id).toBe(3);
        });

        it('should return all if no search term and no filter', () => {
            const result = filterBookmarks(mockBookmarks, '', []);
            expect(result.length).toBe(3);
        });
    });
});
