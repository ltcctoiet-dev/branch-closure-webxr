import { store } from "./store";

/**
 * Which scene we're on, and how we get to the next one.
 *
 * The clever bit is that it keeps a STACK, not just a single "current scene".
 *
 *   goto  — leave this scene, go to that one
 *   push  — go to that one, but REMEMBER where we were
 *   pop   — go back to where we were
 *
 * That's what makes the pause screen work. The script says the customer can
 * pause from anywhere and then carry on. With a stack, "carry on" needs no
 * special handling — the scene underneath is still sitting there waiting.
 */

export interface Step {
  id: string;
  enter(): Promise<void> | void;
  exit(): Promise<void> | void;
}

class Router {
  private steps = new Map<string, Step>();
  private stack: Step[] = [];
  private busy = false;

  register(step: Step): void {
    this.steps.set(step.id, step);
  }

  registerAll(steps: Step[]): void {
    steps.forEach((step) => this.register(step));
  }

  current(): Step | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** How deep the stack is. 1 = normal. 2 = something is layered on top. */
  depth(): number {
    return this.stack.length;
  }

  private find(id: string): Step {
    const step = this.steps.get(id);
    if (!step) {
      throw new Error(
        `Router: no scene called "${id}". Known scenes: ${[...this.steps.keys()].join(", ")}`,
      );
    }
    return step;
  }

  async goto(id: string): Promise<void> {
    if (this.busy) return; // ignore double clicks mid-transition
    this.busy = true;
    try {
      const next = this.find(id);
      const leaving = this.stack.pop();
      if (leaving) await leaving.exit();
      this.stack.push(next);
      store.set({ currentSceneId: id });
      await next.enter();
    } finally {
      this.busy = false;
    }
  }

  async push(id: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const next = this.find(id);
      const beneath = this.current();
      if (beneath) await beneath.exit();
      this.stack.push(next);
      store.set({ currentSceneId: id });
      await next.enter();
    } finally {
      this.busy = false;
    }
  }

  async pop(): Promise<void> {
    if (this.busy || this.stack.length < 2) return;
    this.busy = true;
    try {
      const leaving = this.stack.pop();
      if (leaving) await leaving.exit();
      const beneath = this.current();
      if (beneath) {
        store.set({ currentSceneId: beneath.id });
        await beneath.enter();
      }
    } finally {
      this.busy = false;
    }
  }
}

export const router = new Router();
