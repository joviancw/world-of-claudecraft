// Bridge from REST to the live CustomAwards service (game chat fan-out).

import type { CustomAwards, CustomAwardSession } from './custom_awards';

let service: CustomAwards<CustomAwardSession> | null = null;

export function setCustomAwardsService(instance: CustomAwards<CustomAwardSession> | null): void {
  service = instance;
}

export function customAwardsService(): CustomAwards<CustomAwardSession> | null {
  return service;
}