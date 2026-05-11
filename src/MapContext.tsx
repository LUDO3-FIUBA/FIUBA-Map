import React from "react";
import User from "./User";
import Graph from "./Graph";
import { CARRERAS } from "./carreras";
import { UserType } from "./types/User";
import { GraphType } from "./types/Graph";

export const UserContext = React.createContext<UserType.Context>(null!);
export const GraphContext = React.createContext<GraphType.Context>(null!);

export const MapProvider = ({ children }: React.PropsWithChildren) => {
  const user = User();
  const graph = Graph(user);

  // Integración con Ludo: avisa cuando el componente está listo para recibir mensajes
  // y procesa LUDO_INIT con padron + carreraId
  React.useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "LUDO_INIT") return;
      const carreraId: string = String(event.data.carreraId ?? "");
      const padron: string = String(event.data.padron ?? "");
      user.setIsLudoMode(true);
      (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "FIUBA_MAP_LOG", msg: `LUDO_INIT received: padron=${padron} carreraId=${carreraId}` }));
      if (carreraId) {
        const carrera = CARRERAS.find((c) => c.id === carreraId);
        (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "FIUBA_MAP_LOG", msg: `carrera found: ${carrera ? carrera.id : "NOT FOUND"}` }));
        if (carrera) {
          user.setUser((prev: UserType.Info) => ({ ...prev, carrera, orientacion: null, finDeCarrera: null }));
        }
      }
      if (padron) user.login(padron);
    };
    window.addEventListener("message", handler);
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "FIUBA_MAP_READY" }));
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "FIUBA_MAP_LOG", msg: "MapProvider mounted, listener ready" }));
    return () => window.removeEventListener("message", handler);
  }, [user.login, user.setUser]);

  return (
    <UserContext.Provider value={user}>
      <GraphContext.Provider value={graph}>{children}</GraphContext.Provider>
    </UserContext.Provider>
  );
};
