export interface CompareRange {
  startIndex: number;
  endIndex: number;
}

/** Tracks a single pointer from down to up/cancel; extra pointers are ignored. */
export class ComparePointerSession {
  private pointerId: number | null = null;
  private startIndex: number | null = null;

  start(pointerId: number, startIndex: number): void {
    if (this.pointerId !== null) {
      return;
    }
    this.pointerId = pointerId;
    this.startIndex = startIndex;
  }

  finish(pointerId: number, endIndex: number): CompareRange | null {
    if (this.pointerId !== pointerId || this.startIndex === null) {
      return null;
    }
    const startIndex = this.startIndex;
    this.clear();
    return { startIndex, endIndex };
  }

  cancel(pointerId: number): void {
    if (this.pointerId !== pointerId) {
      return;
    }
    this.clear();
  }

  private clear(): void {
    this.pointerId = null;
    this.startIndex = null;
  }
}
