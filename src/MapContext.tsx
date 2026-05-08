import React from "react";
import User from "./User";
import Graph from "./Graph";
import { UserType } from "./types/User";
import { GraphType } from "./types/Graph";

export const UserContext = React.createContext<UserType.Context>(null!);
export const GraphContext = React.createContext<GraphType.Context>(null!);

export const MapProvider = ({ children }: React.PropsWithChildren) => {
  const user = User();
  const graph = Graph(user);

  // Integración con Ludo: recibe el padron del alumno y hace login automático
  // Mensaje esperado: { type: "LUDO_INIT", padron: string }
  React.useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "LUDO_INIT") return;
      const padron: string = String(event.data.padron ?? "");
      if (padron) user.login(padron);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [user.login]);

  return (
    <UserContext.Provider value={user}>
      <GraphContext.Provider value={graph}>{children}</GraphContext.Provider>
    </UserContext.Provider>
  );
};
