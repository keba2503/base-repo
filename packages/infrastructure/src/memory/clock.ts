import type { Clock } from "@base/application";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  #current: Date;

  constructor(current: Date) {
    this.#current = new Date(current.getTime());
  }

  now(): Date {
    return new Date(this.#current.getTime());
  }

  advanceBy(milliseconds: number): void {
    this.#current = new Date(this.#current.getTime() + milliseconds);
  }
}
