function defaultFingerprint(payload) {
  return JSON.stringify(payload);
}

export class EditorSaveCoordinator {
  constructor({ transport, version = null, onState = null, fingerprint = defaultFingerprint } = {}) {
    if (typeof transport !== 'function') throw new Error('EditorSaveCoordinator necesita un transport.');
    this.transport = transport;
    this.version = Number.isInteger(Number(version)) ? Number(version) : null;
    this.onState = typeof onState === 'function' ? onState : null;
    this.fingerprint = fingerprint;
    this.state = 'clean';
    this.inFlight = null;
    this.pending = null;
    this.retryJob = null;
    this.lastPersistedFingerprint = null;
    this.editSequence = 0;
    this.listeners = new Set();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #setState(state, detail = null) {
    this.state = state;
    this.onState?.(state, detail);
    for (const listener of this.listeners) listener(state, detail);
  }

  sync({ version, payload } = {}) {
    const parsed = Number(version);
    if (Number.isInteger(parsed) && parsed > 0) this.version = parsed;
    if (payload !== undefined) this.lastPersistedFingerprint = this.fingerprint(payload);
    this.retryJob = null;
    this.#setState('clean');
  }

  markDirty() {
    this.editSequence += 1;
    if (!['saving', 'conflict', 'error'].includes(this.state)) this.#setState('dirty');
  }

  enqueue(payload) {
    const fp = this.fingerprint(payload);
    if (!this.inFlight && !this.pending && this.lastPersistedFingerprint === fp && this.state !== 'conflict' && this.state !== 'error') {
      this.#setState('saved', { version: this.version, deduped: true });
      return Promise.resolve({ version: this.version, deduped: true });
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      const job = { payload, fingerprint: fp, sequence: this.editSequence, waiters: [waiter] };
      if (this.inFlight) {
        if (this.pending) {
          this.pending.payload = payload;
          this.pending.fingerprint = fp;
          this.pending.sequence = this.editSequence;
          this.pending.waiters.push(waiter);
        } else {
          this.pending = job;
        }
        this.#setState('saving', { queued: true, version: this.version });
        return;
      }
      void this.#run(job);
    });
  }

  retry() {
    if (!this.retryJob) return Promise.reject(new Error('No hay un guardado para reintentar.'));
    const job = this.retryJob;
    this.retryJob = null;
    return this.enqueue(job.payload);
  }

  async #run(job) {
    this.inFlight = job;
    this.#setState('saving', { version: this.version });
    try {
      const result = await this.transport(job.payload, this.version);
      const nextVersion = Number(result?.version);
      if (Number.isInteger(nextVersion) && nextVersion > 0) this.version = nextVersion;
      this.lastPersistedFingerprint = job.fingerprint;
      for (const waiter of job.waiters) waiter.resolve(result);
      this.inFlight = null;
      this.retryJob = null;

      const next = this.pending;
      this.pending = null;
      if (next) {
        await this.#run(next);
        return;
      }

      if (this.editSequence === job.sequence) this.#setState('saved', { version: this.version });
      else this.#setState('dirty', { version: this.version });
    } catch (error) {
      for (const waiter of job.waiters) waiter.reject(error);
      const pending = this.pending;
      this.pending = null;
      if (pending) for (const waiter of pending.waiters) waiter.reject(error);
      this.inFlight = null;
      this.retryJob = pending || job;
      this.retryJob.error = error;
      this.#setState(error?.code === 'DOCUMENT_VERSION_CONFLICT' ? 'conflict' : 'error', error);
    }
  }

  waitForSettled() {
    if (!['dirty', 'saving'].includes(this.state)) return Promise.resolve(this.state);
    return new Promise((resolve) => {
      const unsubscribe = this.subscribe((state) => {
        if (['saved', 'clean', 'error', 'conflict'].includes(state)) {
          unsubscribe(); resolve(state);
        }
      });
    });
  }
}
