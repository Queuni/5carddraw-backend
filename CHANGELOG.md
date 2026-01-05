# Changelog


## 2026-02-12
- Update the deployment docs with the new environment variables

## 2026-02-16
- Improve logging so we can trace requests through the pipeline in production

## 2026-02-16
- Correct typo in the error message shown when validation fails

## 2026-02-18
- Remove the temporary debug endpoint before the release

## 2026-02-18
- Implement proper cleanup of resources when the process receives SIGTERM

## 2026-02-18
- Adjust the pool size to match the actual concurrency we need

## 2026-02-19
- Clean up debug print statements before the release

## 2026-02-19
- Handle the partial write case and retry the remaining bytes

## 2026-02-20
- Update the deployment docs with the new environment variables

## 2026-02-21
- Implement a simple metrics endpoint for Prometheus scraping

## 2026-02-23
- Implement a small in-memory cache for the config to avoid re-reading

## 2026-02-24
- Simplify the auth flow by using a single token source

## 2026-02-25
- Implement a simple health check endpoint for the load balancer

## 2026-02-25
- Fix race condition in the cache that could return stale data under load

## 2026-02-26
- Improve error message when the required env var is not set

## 2026-02-26
- Adjust the default concurrency limit based on load test results

## 2026-02-26
- Implement a small in-memory cache for the config to avoid re-reading

## 2026-02-27
- Add validation for the config schema before applying settings

## 2026-02-27
- Adjust the default concurrency limit based on load test results

## 2026-02-27
- Update the deployment docs with the new environment variables
