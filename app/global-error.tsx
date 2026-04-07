"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0f1117",
          color: "#f9fafb",
          fontFamily: "Geist, system-ui, sans-serif"
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
            <h1 style={{ margin: "12px 0 8px", fontSize: "28px", lineHeight: 1.1 }}>
              The app failed before the normal layout could render.
            </h1>
            <p style={{ margin: 0, color: "#d1d5db", fontSize: "14px", lineHeight: 1.6 }}>
              This screen exists so Next always has a recovery boundary available in development.
            </p>
            <pre
              style={{
                marginTop: "20px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                borderRadius: "14px",
                padding: "16px",
                background: "#14161f",
                border: "1px solid #2a2d3a",
                color: "#fca5a5",
                fontSize: "13px"
              }}
            >
              {error.message || "Unknown error"}
            </pre>
            <button
              onClick={reset}
              style={{
                marginTop: "20px",
                border: 0,
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
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
