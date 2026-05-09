"use client";

import { useEffect } from "react";
import { Button } from "@/components/shadcn/button";
import { reportError } from "@/lib/server/report-error";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    reportError(error, { boundary: "global-error", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0f1117",
          color: "#f9fafb",
          fontFamily: "var(--font-body), system-ui, sans-serif"
        }}
      >
        <main
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px"
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "720px",
              border: "1px solid #2a2d3a",
              background: "#1a1d27",
              borderRadius: "20px",
              padding: "24px"
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#6b7280"
              }}
            >
              Fatal Error
            </p>
            <h1
              style={{
                margin: "12px 0 8px",
                fontSize: "32px",
                lineHeight: 1.05,
                fontFamily: "var(--font-body), system-ui, -apple-system, sans-serif",
                fontWeight: 600,
                letterSpacing: "-0.04em"
              }}
            >
              We hit a problem before the app finished loading.
            </h1>
            <p style={{ margin: 0, color: "#d1d5db", fontSize: "14px", lineHeight: 1.6 }}>
              This recovery screen is here to help you get back on track. We’ve logged the
              failure and can use the reference below to track it down.
            </p>
            {error.digest ? (
              <div
                style={{
                  marginTop: "20px",
                  borderRadius: "14px",
                  padding: "16px",
                  background: "#14161f",
                  border: "1px solid #2a2d3a",
                  color: "#d1d5db",
                  fontSize: "13px"
                }}
              >
                Error reference: <strong style={{ color: "#f9fafb" }}>{error.digest}</strong>
              </div>
            ) : null}
            <Button
              onClick={reset}
              style={{
                marginTop: "20px",
                borderRadius: "12px",
                padding: "10px 16px",
                background: "#2563eb",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer"
              }}
              type="button"
            >
              Try Again
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
