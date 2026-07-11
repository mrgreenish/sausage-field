import { Vector2, Vector3 } from 'three';
import type { ContactSample, SausageSpec } from '../types';

const NODE_COUNT = 7;
const GRAVITY = 0.36;
const SOLVER_ITERATIONS = 5;

export interface RodState {
  spec: SausageSpec;
  positions: Vector3[];
  previous: Vector3[];
  rest: Vector3[];
  touchHeight: number;
  sleeping: boolean;
  quietTime: number;
  lastImpulse: number;
}

export interface RodVisualState {
  bend: Vector2;
  touchHeight: number;
}

export class RodSolver {
  readonly active = new Map<number, RodState>();

  constructor(private maxActive: number) {}

  setLimit(limit: number): void {
    this.maxActive = limit;
    while (this.active.size > limit) {
      const first = this.active.keys().next().value as number | undefined;
      if (first === undefined) break;
      this.active.delete(first);
    }
  }

  wake(spec: SausageSpec): RodState {
    const existing = this.active.get(spec.id);
    if (existing) return existing;
    if (this.active.size >= this.maxActive) {
      let quietest: RodState | undefined;
      for (const state of this.active.values()) {
        if (!quietest || state.lastImpulse < quietest.lastImpulse) quietest = state;
      }
      if (quietest) this.active.delete(quietest.spec.id);
    }

    const positions: Vector3[] = [];
    const rest: Vector3[] = [];
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const t = i / (NODE_COUNT - 1);
      const p = new Vector3(
        spec.x + spec.leanX * spec.height * t * t,
        spec.groundY + spec.height * t,
        spec.z + spec.leanZ * spec.height * t * t,
      );
      positions.push(p.clone());
      rest.push(p.clone());
    }
    const state: RodState = {
      spec,
      positions,
      previous: positions.map((position) => position.clone()),
      rest,
      touchHeight: 0.55,
      sleeping: false,
      quietTime: 0,
      lastImpulse: 0,
    };
    this.active.set(spec.id, state);
    return state;
  }

  applyContact(spec: SausageSpec, contact: ContactSample): void {
    const state = this.wake(spec);
    state.sleeping = false;
    state.quietTime = 0;
    state.touchHeight = Math.max(0.08, Math.min(0.98, contact.normalizedHeight));
    const nodeIndex = Math.max(1, Math.min(NODE_COUNT - 1, Math.round(state.touchHeight * (NODE_COUNT - 1))));
    const leverage = 0.18 + state.touchHeight * 0.82;
    const compliance = 1.08 - spec.firmness * 0.82;
    const impulse = contact.pressure * leverage * compliance;
    state.positions[nodeIndex].x += contact.direction.x * impulse;
    state.positions[nodeIndex].z += contact.direction.z * impulse;
    if (nodeIndex + 1 < NODE_COUNT) {
      state.positions[nodeIndex + 1].x += contact.direction.x * impulse * 0.62;
      state.positions[nodeIndex + 1].z += contact.direction.z * impulse * 0.62;
    }
    state.lastImpulse = Math.max(state.lastImpulse, impulse);
  }

  step(dt: number, elapsed: number): void {
    const substeps = 2;
    const subDt = Math.min(dt, 1 / 30) / substeps;
    for (let step = 0; step < substeps; step += 1) {
      for (const state of this.active.values()) this.integrate(state, subDt, elapsed);
    }
    for (const [id, state] of this.active) {
      const visual = this.getVisual(state);
      const energy = visual.bend.length() + state.lastImpulse;
      state.lastImpulse *= 0.9;
      if (energy < 0.008) state.quietTime += dt;
      else state.quietTime = 0;
      if (state.quietTime > 2.2) {
        state.sleeping = true;
        this.active.delete(id);
      }
    }
  }

  getVisualFor(id: number): RodVisualState | undefined {
    const state = this.active.get(id);
    return state ? this.getVisual(state) : undefined;
  }

  reset(): void {
    this.active.clear();
  }

  private integrate(state: RodState, dt: number, elapsed: number): void {
    const { spec, positions, previous, rest } = state;
    const damping = Math.pow(spec.damping, dt * 60);
    const windX = Math.sin(elapsed * 0.78 + spec.windPhase) * 0.08;
    const windZ = Math.cos(elapsed * 0.61 + spec.windPhase * 1.37) * 0.055;
    const dt2 = dt * dt;
    for (let i = 1; i < NODE_COUNT; i += 1) {
      const p = positions[i];
      const old = previous[i];
      const vx = (p.x - old.x) * damping;
      const vy = (p.y - old.y) * damping;
      const vz = (p.z - old.z) * damping;
      old.copy(p);
      const t = i / (NODE_COUNT - 1);
      p.x += vx + windX * t * dt2;
      p.y += vy - GRAVITY * t * dt2;
      p.z += vz + windZ * t * dt2;
    }

    const segmentLength = spec.height / (NODE_COUNT - 1);
    const returnStrength = 0.025 + spec.firmness * 0.16;
    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
      positions[0].copy(rest[0]);
      for (let i = 1; i < NODE_COUNT; i += 1) {
        const a = positions[i - 1];
        const b = positions[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const distance = Math.max(0.0001, Math.hypot(dx, dy, dz));
        const correction = (distance - segmentLength) / distance;
        if (i === 1) {
          b.x -= dx * correction;
          b.y -= dy * correction;
          b.z -= dz * correction;
        } else {
          a.x += dx * correction * 0.45;
          a.y += dy * correction * 0.45;
          a.z += dz * correction * 0.45;
          b.x -= dx * correction * 0.55;
          b.y -= dy * correction * 0.55;
          b.z -= dz * correction * 0.55;
        }
      }
      for (let i = 1; i < NODE_COUNT; i += 1) {
        const t = i / (NODE_COUNT - 1);
        const pull = returnStrength * (1 - t * 0.25);
        positions[i].x += (rest[i].x - positions[i].x) * pull;
        positions[i].z += (rest[i].z - positions[i].z) * pull;
      }
      for (let i = 1; i < NODE_COUNT - 1; i += 1) {
        const midpointX = (positions[i - 1].x + positions[i + 1].x) * 0.5;
        const midpointZ = (positions[i - 1].z + positions[i + 1].z) * 0.5;
        const bendStrength = 0.035 + spec.firmness * 0.12;
        positions[i].x += (midpointX - positions[i].x) * bendStrength;
        positions[i].z += (midpointZ - positions[i].z) * bendStrength;
      }
    }
    positions[0].copy(rest[0]);
  }

  private getVisual(state: RodState): RodVisualState {
    const index = Math.max(1, Math.min(NODE_COUNT - 1, Math.round(state.touchHeight * (NODE_COUNT - 1))));
    const displacement = new Vector2();
    for (let i = index; i < NODE_COUNT; i += 1) {
      const weight = (i - index + 1) / (NODE_COUNT - index + 1);
      displacement.x += (state.positions[i].x - state.rest[i].x) * weight;
      displacement.y += (state.positions[i].z - state.rest[i].z) * weight;
    }
    const divisor = Math.max(1, NODE_COUNT - index);
    displacement.multiplyScalar(1 / divisor);
    const maxBend = state.spec.height * 0.72;
    if (displacement.length() > maxBend) displacement.setLength(maxBend);
    return { bend: displacement, touchHeight: state.touchHeight };
  }
}
