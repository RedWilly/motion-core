import type { MotionStateTarget } from '../shared/runtime';

export class MotionTargetRegistry {
  private readonly targets: MotionStateTarget[] = [];

  register(target: MotionStateTarget): () => void {
    if (!this.targets.includes(target)) this.targets.push(target);
    return () => this.remove(target);
  }

  remove(target: MotionStateTarget): void {
    const index = this.targets.indexOf(target);
    if (index >= 0) this.targets.splice(index, 1);
  }

  apply(): void {
    for (const target of this.targets) target.apply();
  }
}
