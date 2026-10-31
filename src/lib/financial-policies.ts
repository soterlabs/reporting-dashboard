export const rollupPolicy = "prime-management.statement-rollups.v3.1";
export const rwaPolicy = "prime-management.rwa-income.v3.2";
export const allocationRewardsPolicy =
  "prime-management.allocation-rewards.v3.3";
export const rwaPolicies = [rwaPolicy, allocationRewardsPolicy];
export const rollupPolicies = [rollupPolicy, ...rwaPolicies];
