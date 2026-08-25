import { describe, expect, it } from 'vitest';

import { ComparePointerSession } from './compare-pointer-session';

describe('ComparePointerSession', () => {
  it('returns the start and end indices for the same pointer', () => {
    const session = new ComparePointerSession();
    session.start(1, 4);
    expect(session.finish(1, 10)).toEqual({ startIndex: 4, endIndex: 10 });
  });

  it('ignores a second pointer while the first is active', () => {
    const session = new ComparePointerSession();
    session.start(1, 4);
    session.start(2, 20);
    expect(session.finish(2, 25)).toBeNull();
    expect(session.finish(1, 10)).toEqual({ startIndex: 4, endIndex: 10 });
  });

  it('ignores finish from an unknown pointer', () => {
    const session = new ComparePointerSession();
    expect(session.finish(1, 10)).toBeNull();
    session.start(1, 4);
    expect(session.finish(9, 10)).toBeNull();
    expect(session.finish(1, 10)).toEqual({ startIndex: 4, endIndex: 10 });
  });

  it('clears on cancel so a later pointer can start', () => {
    const session = new ComparePointerSession();
    session.start(1, 4);
    session.cancel(1);
    expect(session.finish(1, 10)).toBeNull();
    session.start(2, 7);
    expect(session.finish(2, 12)).toEqual({ startIndex: 7, endIndex: 12 });
  });

  it('ignores cancel from a different pointer', () => {
    const session = new ComparePointerSession();
    session.start(1, 4);
    session.cancel(2);
    expect(session.finish(1, 10)).toEqual({ startIndex: 4, endIndex: 10 });
  });
});
