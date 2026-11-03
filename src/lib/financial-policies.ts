export const rollupPolicy = "prime-management.statement-rollups.v3.1";
export const rwaPolicy = "prime-management.rwa-income.v3.2";
export const allocationRewardsPolicy =
  "prime-management.allocation-rewards.v3.3";
export const offchainPolicy = "prime-management.offchain-accruals.v3.4";
export const archivePolicy = "prime-management.archive-income.v3.5";
export const sparkIncomePolicy = "prime-management.spark-income.v3.6";
export const archivePolicies = [archivePolicy, sparkIncomePolicy];
export const offchainPolicies = [offchainPolicy, ...archivePolicies];
export const allocationRewardsPolicies = [
  allocationRewardsPolicy,
  ...offchainPolicies,
];
export const rwaPolicies = [rwaPolicy, ...allocationRewardsPolicies];
export const rollupPolicies = [rollupPolicy, ...rwaPolicies];
