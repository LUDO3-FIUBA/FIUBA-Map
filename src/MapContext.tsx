import React from "react";
import User from "./User";
import Graph from "./Graph";
import { CARRERAS } from "./carreras";
import { UserType } from "./types/User";
import { GraphType } from "./types/Graph";

export const UserContext = React.createContext<UserType.Context>(null!);
export const GraphContext = React.createContext<GraphType.Context>(null!);

// Works in both React Native WebView and browser iframe contexts
const postToParent = (data: object) => {
  const msg = JSON.stringify(data);
  if ((window as any).ReactNativeWebView) {
    (window as any).ReactNativeWebView.postMessage(msg);
  } else if (window.parent !== window) {
    window.parent.postMessage(data, "*");
  }
};

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
      postToParent({ type: "FIUBA_MAP_LOG", msg: `LUDO_INIT received: padron=${padron} carreraId=${carreraId}` });
      if (carreraId) {
        const carrera = CARRERAS.find((c) => c.id === carreraId);
        postToParent({ type: "FIUBA_MAP_LOG", msg: `carrera found: ${carrera ? carrera.id : "NOT FOUND"}` });
        if (carrera) {
          user.setUser((prev: UserType.Info) => ({ ...prev, carrera, orientacion: null, finDeCarrera: null }));
        }
      }
      if (padron) user.login(padron);
    };
    window.addEventListener("message", handler);
    postToParent({ type: "FIUBA_MAP_READY" });
    postToParent({ type: "FIUBA_MAP_LOG", msg: "MapProvider mounted, listener ready" });
    return () => window.removeEventListener("message", handler);
  }, [user.login, user.setUser]);

  return (
    <UserContext.Provider value={user}>
      <GraphContext.Provider value={graph}>{children}</GraphContext.Provider>
    </UserContext.Provider>
  );
};
