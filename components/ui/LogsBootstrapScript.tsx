import { LOGS_EARLY_BOOTSTRAP_SCRIPT } from "@/lib/client/logs-bootstrap";

export function LogsBootstrapScript() {
  return (
    <script
      id="logs-bootstrap-early"
      dangerouslySetInnerHTML={{ __html: LOGS_EARLY_BOOTSTRAP_SCRIPT }}
    />
  );
}
