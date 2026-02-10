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

## 2026-01-05
- Adjust the threshold so we only log when it's actually an issue

## 2026-01-05
- Clean up the commented-out code that was left from debugging

## 2026-01-07
- Clean up the test fixtures and move shared data to a single file

## 2026-01-07
- Support environment-specific overrides via separate config files

## 2026-01-08
- Clean up debug print statements before the release

## 2026-01-08
- Handle the case when the external service returns an empty list

## 2026-01-12
- Improve test coverage for the helpers module to above 90%

## 2026-01-12
- Update documentation to reflect the new API and usage examples

## 2026-01-12
- Clean up duplicate logic between the sync and async code paths

## 2026-01-13
- Bump the dependency to fix the compatibility issue with Python 3.12

## 2026-01-14
- Refactor utils to use a single source of truth for default values

## 2026-01-15
- Correct the default so it matches what the documentation says

## 2026-01-21
- Bump the CI image to use the latest stable runner version

## 2026-01-21
- Implement retry logic for the API client when the remote returns 5xx

## 2026-01-22
- Fix the off-by-one error in the date range iterator

## 2026-01-22
- Update the example config with all available options and comments

## 2026-01-23
- Bump version to 1.2.0 and add changelog entry for the new features

## 2026-01-26
- Update the contributing guide with the new review process

## 2026-01-29
- Improve the CLI help text so it's clear how to use each option

## 2026-01-29
- Correct the docstring to match the actual behavior of the function

## 2026-01-29
- Refactor error handling to use a custom exception hierarchy

## 2026-02-04
- Add a small delay between retries to avoid thundering herd

## 2026-02-05
- Adjust timeout and retry settings based on production observations

## 2026-02-05
- Handle the case when the external service returns an empty list

## 2026-02-06
- Simplify the auth flow by using a single token source

## 2026-02-06
- Update the example config with all available options and comments

## 2026-02-09
- Bump the Docker base image to get the latest security patches

## 2026-02-09
- Simplify the build script by using the same steps for dev and prod

## 2026-02-10
- Remove the unused parameter that was left from an old refactor

## 2026-02-10
- Clean up the formatting and run the linter on the changed files
