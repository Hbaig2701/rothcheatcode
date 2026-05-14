'use server';

/**
 * Server Action wrapper for the training simulator. File-level 'use server'
 * (rather than inline) is required because client components import this
 * module - Next.js disallows inline 'use server' in any module a Client
 * Component depends on.
 *
 * The actual math lives in `simulate.ts` so server components can keep
 * calling it as a plain sync function for initial-state rendering.
 */

import { runOnce, type TrainingSimResult } from './simulate';
import type { CastId } from './cast';
import type { Client } from '@/lib/types/client';

export async function simulate(
  castId: CastId,
  overrides: Partial<Client> = {},
): Promise<TrainingSimResult> {
  return runOnce(castId, overrides);
}
