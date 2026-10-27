import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "reporting-dashboard";
export default defineRailway(() => {
  const reportingDashboard = service("reporting-dashboard", {
    source: github("soterlabs/reporting-dashboard", {
      branch: "main",
      checkSuites: false,
    }),
    build: {
      buildCommand: "npm run build",
      buildEnvironment: "V3",
      builder: "RAILPACK",
    },
    start: "npm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "us-west2": 1 },
  });

  return project("reporting-dashboard", {
    variables: { managed: false },
    resources: [reportingDashboard],
  });
});
