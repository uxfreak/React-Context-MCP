export class Mutex {
  #lock: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release: () => void;
    const p = new Promise<void>(resolve => {
      release = resolve;
    });

    const previous = this.#lock;
    this.#lock = previous.then(() => p);

    await previous;
    return release!;
  }
}
