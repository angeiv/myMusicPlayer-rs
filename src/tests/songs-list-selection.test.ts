import { describe, expect, it } from 'vitest';

import {
  clearSelection,
  createSelectionState,
  getVisibleSelectedIds,
  isSelectionStateEqual,
  reconcileSelection,
  selectFromContextMenu,
  selectRange,
  selectSingle,
  toggleSelection,
} from '../lib/features/songs-list/selection';

const visibleIds = ['a', 'b', 'c', 'd'];

describe('songs-list selection', () => {
  it('single click selects one row and resets active/anchor', () => {
    const next = selectSingle(createSelectionState(), 'b');

    expect(next).toEqual({
      selectedIds: ['b'],
      activeTrackId: 'b',
      anchorTrackId: 'b',
    });
  });

  it('cmd/ctrl toggle adds a row and updates active/anchor', () => {
    const seeded = selectSingle(createSelectionState(), 'b');
    const next = toggleSelection(seeded, 'd');

    expect(next).toEqual({
      selectedIds: ['b', 'd'],
      activeTrackId: 'd',
      anchorTrackId: 'd',
    });
  });

  it('cmd/ctrl toggle removes a row and keeps other selections', () => {
    const seeded = {
      selectedIds: ['b', 'd'],
      activeTrackId: 'd',
      anchorTrackId: 'd',
    };

    const next = toggleSelection(seeded, 'd');

    expect(next).toEqual({
      selectedIds: ['b'],
      activeTrackId: 'd',
      anchorTrackId: 'd',
    });
  });

  it('shift click replaces selection with visible range', () => {
    const seeded = selectSingle(createSelectionState(), 'b');
    const next = selectRange(seeded, visibleIds, 'd');

    expect(next.selectedIds).toEqual(['b', 'c', 'd']);
    expect(next.activeTrackId).toBe('d');
    expect(next.anchorTrackId).toBe('d');
  });

  it('shift click falls back to single select when anchor is null', () => {
    const seeded = {
      selectedIds: ['a', 'b'],
      activeTrackId: 'b',
      anchorTrackId: null,
    };

    const next = selectRange(seeded, visibleIds, 'c');

    expect(next).toEqual({
      selectedIds: ['c'],
      activeTrackId: 'c',
      anchorTrackId: 'c',
    });
  });

  it('shift click falls back to single select when anchor is not visible', () => {
    const seeded = {
      selectedIds: ['z'],
      activeTrackId: 'z',
      anchorTrackId: 'z',
    };

    const next = selectRange(seeded, visibleIds, 'c');

    expect(next).toEqual({
      selectedIds: ['c'],
      activeTrackId: 'c',
      anchorTrackId: 'c',
    });
  });

  it('right click on an unselected row replaces selection with that row', () => {
    const seeded = {
      selectedIds: ['b', 'c'],
      activeTrackId: 'c',
      anchorTrackId: 'c',
    };

    const next = selectFromContextMenu(seeded, 'd');

    expect(next).toEqual({
      selectedIds: ['d'],
      activeTrackId: 'd',
      anchorTrackId: 'd',
    });
  });

  it('right click on a selected row preserves the multi-selection', () => {
    const seeded = {
      selectedIds: ['b', 'c'],
      activeTrackId: 'b',
      anchorTrackId: 'b',
    };

    const next = selectFromContextMenu(seeded, 'c');

    expect(next).toEqual({
      selectedIds: ['b', 'c'],
      activeTrackId: 'c',
      anchorTrackId: 'c',
    });
  });

  it('reconcileSelection drops missing selected ids and clears missing or hidden active/anchor ids', () => {
    const seeded = {
      selectedIds: ['a', 'x', 'd'],
      activeTrackId: 'x',
      anchorTrackId: 'd',
    };

    const next = reconcileSelection(seeded, ['a', 'b', 'c', 'd'], ['a', 'b', 'c']);

    expect(next).toEqual({
      selectedIds: ['a', 'd'],
      activeTrackId: null,
      anchorTrackId: null,
    });
  });

  it('clearSelection empties visible and hidden selections', () => {
    expect(clearSelection()).toEqual({
      selectedIds: [],
      activeTrackId: null,
      anchorTrackId: null,
    });
  });

  it('getVisibleSelectedIds returns only visible selections in visible order', () => {
    const state = {
      selectedIds: ['d', 'z', 'b'],
      activeTrackId: 'd',
      anchorTrackId: 'd',
    };

    expect(getVisibleSelectedIds(state, visibleIds)).toEqual(['b', 'd']);
  });

  it('isSelectionStateEqual returns true when state is unchanged', () => {
    const left = {
      selectedIds: ['b', 'd'],
      activeTrackId: 'd',
      anchorTrackId: 'd',
    };
    const right = {
      selectedIds: ['b', 'd'],
      activeTrackId: 'd',
      anchorTrackId: 'd',
    };

    expect(isSelectionStateEqual(left, right)).toBe(true);
  });
});
