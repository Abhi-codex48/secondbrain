import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "./lib/supabase";
import { useRoute } from "./lib/router";
import { Layout } from "./components/Layout";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import { Auth, NewPassword, NotConfigured } from "./pages/Auth";
import { Home } from "./pages/Home";
import { News } from "./pages/News";
import { Notes } from "./pages/Notes";
import { More } from "./pages/More";
import { Search } from "./pages/Search";

// The editor (TipTap) and backup tools are loaded on first use to keep start-up fast.
const Reader = lazy(() => import("./pages/Reader").then((m) => ({ default: m.Reader })));
const NoteEditor = lazy(() => import("./pages/NoteEditor").then((m) => ({ default: m.NoteEditor })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));

function Pages() {
  const route = useRoute();
  const [p, id] = route.path;
  let page: React.ReactNode;
  switch (p) {
    case "news": page = <News />; break;
    case "read": page = <Reader key={id} id={id} />; break;
    case "notes": page = <Notes route={route} />; break;
    case "note": page = <NoteEditor key={id} id={id ?? "new"} route={route} />; break;
    case "more": page = <More route={route} />; break;
    case "search": page = <Search route={route} />; break;
    case "settings": page = <Settings />; break;
    default: page = <Home />;
  }
  return <Layout route={route}><Suspense fallback={<div className="page"><div className="skel" style={{ width: "40%", height: 28 }} /></div>}>{page}</Suspense></Layout>;
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) return <NotConfigured />;
  if (session === undefined) return null;
  return (
    <ToastProvider>
      <ConfirmProvider>
        {recovery ? <NewPassword onDone={() => setRecovery(false)} /> : session ? <Pages /> : <Auth />}
      </ConfirmProvider>
    </ToastProvider>
  );
}
