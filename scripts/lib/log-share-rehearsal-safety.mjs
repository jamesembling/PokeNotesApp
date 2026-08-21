function asError(error, fallbackMessage) {
  if (error instanceof Error) {
    return error;
  }
  const code = error && typeof error === "object" && "code" in error ? error.code : "unknown";
  return new Error(`${fallbackMessage}: ${code}`);
}

export function collectShareTokens(results, observedTokens, operation) {
  const rows = [];
  const errors = [];

  for (const [index, result] of results.entries()) {
    for (const row of Array.isArray(result?.data) ? result.data : []) {
      if (typeof row?.id === "string" && row.id) {
        observedTokens.add(row.id);
        rows.push(row);
      }
    }

    if (result?.error) {
      errors.push(asError(result.error, `${operation} ${index + 1} failed`));
    } else if (!Array.isArray(result?.data) || result.data.length !== 1) {
      errors.push(new Error(`${operation} ${index + 1} returned no single row`));
    }
  }

  return { rows, errors };
}

export function collectSettledShareResults(settledResults, observedTokens, operation) {
  const fulfilled = [];
  const rejectedErrors = [];

  for (const [index, result] of settledResults.entries()) {
    if (result.status === "fulfilled") {
      fulfilled.push(result.value);
    } else {
      rejectedErrors.push(
        asError(result.reason, `${operation} ${index + 1} rejected`)
      );
    }
  }

  const outcome = collectShareTokens(fulfilled, observedTokens, operation);
  return { rows: outcome.rows, errors: [...rejectedErrors, ...outcome.errors] };
}

async function queryActiveFixtureShares(client, logId, nowIso) {
  return client
    .from("log_shares")
    .select("id")
    .eq("source_log_id", logId)
    .gt("expires_at", nowIso);
}

export async function cleanupFixtureShares({ fixtures, publicClient, now = new Date() }) {
  const errors = [];
  const allObservedTokens = new Set();
  const nowIso = now.toISOString();

  for (const fixture of fixtures) {
    const initialTokens = new Set(fixture.observedTokens);
    for (const token of initialTokens) {
      allObservedTokens.add(token);
    }

    for (let pass = 0; pass < 2; pass += 1) {
      const tokensThisPass = pass === 0 ? new Set(initialTokens) : new Set();
      try {
        const active = await queryActiveFixtureShares(fixture.client, fixture.logId, nowIso);
        if (active.error) {
          errors.push(asError(active.error, `Cleanup could not inspect ${fixture.label}`));
        } else {
          for (const row of active.data ?? []) {
            if (typeof row?.id === "string" && row.id) {
              tokensThisPass.add(row.id);
              allObservedTokens.add(row.id);
            }
          }
        }
      } catch (error) {
        errors.push(asError(error, `Cleanup could not inspect ${fixture.label}`));
      }

      for (const token of tokensThisPass) {
        try {
          const revoked = await fixture.client.rpc("revoke_log_share", { p_share_id: token });
          if (revoked.error) {
            errors.push(asError(revoked.error, `Cleanup could not revoke ${fixture.label}`));
          }
        } catch (error) {
          errors.push(asError(error, `Cleanup could not revoke ${fixture.label}`));
        }
      }
    }

    try {
      const residual = await queryActiveFixtureShares(fixture.client, fixture.logId, nowIso);
      if (residual.error) {
        errors.push(asError(residual.error, `Cleanup could not verify ${fixture.label}`));
      } else if ((residual.data ?? []).length > 0) {
        for (const row of residual.data) {
          if (typeof row?.id === "string" && row.id) {
            allObservedTokens.add(row.id);
          }
        }
        errors.push(new Error(`Cleanup left active shares for ${fixture.label}`));
      }
    } catch (error) {
      errors.push(asError(error, `Cleanup could not verify ${fixture.label}`));
    }
  }

  for (const token of allObservedTokens) {
    try {
      const publicResult = await publicClient.rpc("get_active_log_share", { p_token: token });
      if (publicResult.error) {
        errors.push(asError(publicResult.error, "Cleanup could not verify a public token"));
      } else if ((publicResult.data ?? []).length > 0) {
        errors.push(new Error("Cleanup left an observed token publicly active"));
      }
    } catch (error) {
      errors.push(asError(error, "Cleanup could not verify a public token"));
    }
  }

  return errors;
}

export function finalizeRehearsal({ phase, primaryError, cleanupErrors, log = console.log }) {
  if (primaryError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [asError(primaryError, "Rehearsal failed"), ...cleanupErrors],
      "Atomic share rehearsal failed and cleanup verification was incomplete"
    );
  }
  if (primaryError) {
    throw asError(primaryError, "Atomic share rehearsal failed");
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Atomic share rehearsal cleanup verification failed"
    );
  }

  log(`Atomic share rehearsal passed for ${phase} on the confirmed staging host.`);
}
