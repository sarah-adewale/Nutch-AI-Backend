/**
 * Fails fast on configuration that would be unsafe or broken in production.
 *
 * Placeholder secrets are the specific hazard: `.env.example` ships values like
 * "your-super-secret-jwt-key-change-in-production", and a deploy that inherits
 * one is trivially forgeable rather than merely misconfigured.
 */

export interface ConfigIssue {
  key: string;
  problem: string;
}

const PLACEHOLDER = /^your-/i;

/** Required in every environment. */
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

/** Must not be a placeholder once NODE_ENV is production. */
const SECRETS = ['JWT_SECRET', 'ENCRYPTION_KEY'];

const MIN_SECRET_LENGTH = 32;

export function validateConfig(
  env: Record<string, string | undefined>,
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const isProduction = env.NODE_ENV === 'production';

  for (const key of REQUIRED) {
    if (!env[key]?.trim()) {
      issues.push({ key, problem: 'is required but not set' });
    }
  }

  for (const key of SECRETS) {
    const value = env[key]?.trim();
    if (!value) continue;

    if (PLACEHOLDER.test(value)) {
      issues.push({
        key,
        problem: isProduction
          ? 'is still the placeholder from .env.example'
          : 'is still the placeholder from .env.example (allowed outside production)',
      });
      continue;
    }

    if (isProduction && value.length < MIN_SECRET_LENGTH) {
      issues.push({
        key,
        problem: `must be at least ${MIN_SECRET_LENGTH} characters in production`,
      });
    }
  }

  return issues;
}

/** Issues that should stop the process rather than warn. */
export function fatalIssues(
  env: Record<string, string | undefined>,
): ConfigIssue[] {
  const issues = validateConfig(env);
  if (env.NODE_ENV !== 'production') {
    // Locally a placeholder is inconvenient, not dangerous; the services that
    // need a real value refuse individually.
    return issues.filter((issue) => issue.problem.includes('is required'));
  }
  return issues;
}
