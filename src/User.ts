import React from "react";
import { CARRERAS } from "./carreras";
import * as C from "./constants";
import { getGraphs, postGraph, postUser } from "./dbutils";
import { UserType } from "./types/User";
import { GoogleSheetAPI } from "./types/externalAPI";

// Mapeo de IDs de carrera de LUDO3 a IDs de FIUBA-Map.
// Se usan los planes anteriores a 2020 porque sus IDs son códigos numéricos del SIU
// (ej. "75.40") que coinciden con los códigos que manda LUDO3.
// Los planes 2020 usan IDs alfabéticos (ej. "AMII") que no coinciden.
const LUDO3_CARRERA_MAP: Record<string, string> = {
  Informatica: "informatica",
  Sistemas:    "sistemas",
  Civil:       "civil",
  Mecanica:    "mecanica",
  Electrica:   "electricista",
  Electronica: "electronica",
  Industrial:  "industrial",
  Quimica:     "quimica",
  Agrimensura: "agrimensura",
  Alimentos:   "alimentos",
  Naval:       "naval",
  Petroleo:    "petroleo",
};

type Ludo3Init = {
  carrera: string;
  materias: Record<string, { aprobada: boolean; nota?: number }>;
};

// La base de datos se parte en dos tablas (relacional... ponele)
// La clave que une a las bases de datos es la combinación de padron y carrera
// Por un lado, se guarda en allLogins [padron, carrera, orientacion, findecarrera]
// Por el otro, se guarda en maps [padron, carrera, mapa]

// El padron se setea una vez que el usuario se loguea exitosamente (O sea, logged = padron !== "")
// allLogins contiene un array con todas las [carrera,orientacion,findecarrera] que tiene el usuario en la DB
// maps contiene todos los mapas que tiene el usuario en la DB
const initialUser: UserType.Info = {
  padron: "",
  carrera: CARRERAS.find((c) => c.id === "informatica-2020")!,
  orientacion: null,
  finDeCarrera: null,
  allLogins: [],
  maps: [],
};

const Login = (): UserType.Context => {
  const [user, setUser] = React.useState<UserType.Info>(initialUser);

  // Inicializamos el padron en lo que hay en el storage, o vacio
  const [padronInput, setPadronInput] = React.useState(
    window.localStorage.getItem("padron") || "",
  );
  const logged = user.padron !== "";

  // Loading es para el spinner del input del padron
  // Si tenemos algo en el storage, directo arrancamos con loading
  const [loading, setLoading] = React.useState(
    !!window.localStorage.getItem("padron"),
  );

  // loggingIn es para cuando la pagina esta cargando todos los datos del usuario
  const [loggingIn, setLoggingIn] = React.useState(false);

  // On boot: si viene desde LUDO3 usamos los datos inyectados; si no, flujo normal con padron
  React.useEffect(() => {
    const ludo3 = (window as any).__LUDO3_INIT__ as Ludo3Init | undefined;
    if (ludo3?.carrera) {
      const carreraid = LUDO3_CARRERA_MAP[ludo3.carrera] ?? "informatica";
      const carrera = CARRERAS.find((c) => c.id === carreraid) ?? initialUser.carrera;

      const rawMaterias = ludo3.materias ?? {};
      const materias = Object.keys(rawMaterias)
        .filter((id) => rawMaterias[id].aprobada)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((id) => ({ id, nota: rawMaterias[id].nota ?? 4 } as any));

      setUser({
        padron: "ludo3",
        carrera,
        orientacion: null,
        finDeCarrera: null,
        allLogins: [{ carreraid: carrera.id, orientacionid: undefined, findecarreraid: undefined }],
        maps: [{ carreraid: carrera.id, map: { materias } }],
      });
      return;
    }

    if (padronInput) {
      login(padronInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // login agarra todo lo que sabemos del usuario, de ambas tablas de la DB
  // y lo guarda en el estado `user`
  // Usamos de carrera la ultima que registro el usuario
  const login = async (padron: string) => {
    setLoading(true);
    if (!padron) {
      setLoading(false);
      return false;
    }

    const padrones = await fetch(
      `${C.SPREADSHEET}/${C.SHEETS.user}!B:B?majorDimension=COLUMNS&key=${C.KEY}`,
    )
      .then((res) => res.json())
      .then((res: GoogleSheetAPI.UserValueRange) =>
        !res.error ? res.values[0] : null,
      );

    if (!padrones) {
      setLoading(false);
      return false;
    }

    const indexes: number[] = [];
    let j = -1;
    while ((j = padrones.indexOf(padron, j + 1)) !== -1) {
      indexes.push(j);
    }

    if (!indexes.length) {
      setLoading(false);
      return false;
    }

    setLoggingIn(true);
    const ranges = indexes.map(
      (index) => `&ranges=${C.SHEETS.user}!${index + 1}:${index + 1}`,
    );

    const data = await fetch(
      `${C.SPREADSHEET}:batchGet?key=${C.KEY}${ranges.join("")}`,
    ).then((res) =>
      res.json().then((res: GoogleSheetAPI.BatchGet) => res.valueRanges),
    );

    const allLogins: UserType.CarreraInfo[] = data.map((d) => ({
      carreraid: d.values[0][2],
      orientacionid: d.values[0][3],
      findecarreraid: d.values[0][4],
    }));

    let carrera = CARRERAS.find((c) => c.id === "informatica-2020")!;
    let orientacion: UserType.Orientacion | undefined = undefined;
    let finDeCarrera: UserType.FinDeCarrera | undefined = undefined;
    for (const login of allLogins) {
      const foundCarrera = CARRERAS.find((c) => c.id === login.carreraid);
      if (foundCarrera) {
        carrera = foundCarrera;
        orientacion = foundCarrera.orientaciones?.find(
          (c) => c.nombre === login.orientacionid,
        );
        finDeCarrera = carrera.finDeCarrera?.find(
          (c) => c.id === login.findecarreraid,
        );
        break;
      }
    }

    const maps = await getGraphs(padron);

    setUser({
      padron,
      carrera,
      orientacion,
      finDeCarrera,
      allLogins,
      maps,
    });
    window.localStorage.setItem("padron", padron);
    setLoading(false);
    setLoggingIn(false);
    return true;
  };

  // register es para hacer nuevos registros de un usuario en la DB
  // Solo lidia con [padron, carrera, orientacion, findecarrera], no con mapas
  // Se usa para siempre tener un registro de cual es la ultima carrera que un usuario uso
  // Asi no tenes que a mano guardar un cambio de carrera
  const register = async (user: UserType.Info) => {
    const addToAllLogins = () => {
      const newAllLogins = user.allLogins.filter(
        (l) => l.carreraid !== user.carrera.id,
      );
      newAllLogins.push({
        carreraid: user.carrera.id,
        orientacionid: user.orientacion?.nombre,
        findecarreraid: user.finDeCarrera?.id,
      });
      return newAllLogins;
    };

    await postUser(user);
    setUser({
      ...user,
      allLogins: [...addToAllLogins()],
    });
  };

  // Signup es para registrar usuarios nuevos
  // no hace mas que guardar en el storage el padron, y llamar a register
  const signup = async (padron: string) => {
    const newUser = {
      ...user,
      padron,
    };
    window.localStorage.setItem("padron", padron);
    setLoading(true);
    await register(newUser);
    setLoading(false);
  };

  // En el logout limpiamos el usuario entero, y nos quedamos en la carrera seteada
  const logout = () => {
    setUser({ ...initialUser, carrera: user.carrera });
    window.localStorage.removeItem("padron");
  };

  // Aca guardamos el mapa y toda la metadata que tiene
  const saveUserGraph: UserType.SaveGraph = async (
    user,
    materias,
    checkboxes,
    optativas,
    aplazos,
  ) => {
    const map: UserType.CarreraMap = {
      materias,
    };
    if (checkboxes) {
      map.checkboxes = checkboxes;
    }
    if (optativas) {
      map.optativas = optativas;
    }
    if (aplazos) {
      map.aplazos = aplazos;
    }
    await postGraph(user, map);

    const addToMaps = () => {
      if (!user.maps) return [];
      const newMaps = user.maps.filter((l) => l.carreraid !== user.carrera.id);
      newMaps.push({
        carreraid: user.carrera.id,
        map,
      });
      return newMaps;
    };

    setUser({
      ...user,
      maps: [...addToMaps()],
    });
  };

  return {
    user,
    logged,
    login,
    loading,
    register,
    logout,
    setUser,
    padronInput,
    setPadronInput,
    loggingIn,
    saveUserGraph,
    signup,
  };
};

export default Login;
