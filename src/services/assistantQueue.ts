type Priority = 'interactive' | 'background' | 'barrier';

interface QueuedTask {
  priority: Priority;
  run: () => Promise<void>;
}

export class AssistantQueue {
  private tasks: QueuedTask[] = [];
  private running = false;

  enqueue<T>(priority: Priority, task: () => Promise<T>): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
      this.tasks.push({
        priority,
        run: async () => {
          try {
            resolve(await task());
          } catch (error) {
            reject(error);
          }
        },
      });
    });
    void this.drain();
    return result;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.tasks.length) {
        const barrier = this.tasks.findIndex(task => task.priority === 'barrier');
        const interactive = this.tasks.findIndex((task, index) =>
          task.priority === 'interactive' && (barrier < 0 || index < barrier));
        const [next] = this.tasks.splice(interactive < 0 ? 0 : interactive, 1);
        await next.run();
      }
    } finally {
      this.running = false;
    }
  }
}
