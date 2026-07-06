import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { useHosts } from "@/runtime/host-runtime";
import { SessionsScreen } from "@/screens/sessions-screen";

export default function SessionsRoute() {
  const serverId = useHosts()[0]?.serverId ?? null;
  return (
    <HostRouteBootstrapBoundary>
      {serverId ? <SessionsScreen serverId={serverId} /> : null}
    </HostRouteBootstrapBoundary>
  );
}
