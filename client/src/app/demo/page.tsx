import { redirect } from "next/navigation";
import { isDemoRouteEnabled } from "@/lib/config/demo-server";
import { DemoClient } from "./DemoClient";

export default function DemoPage() {
  if (!isDemoRouteEnabled()) {
    redirect("/");
  }

  return <DemoClient />;
}
