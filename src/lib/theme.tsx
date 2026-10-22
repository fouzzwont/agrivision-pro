import * as React from "react";

type Theme = "light" | "dark";
const ThemeCtx = React.createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>("light");

  React.useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("av-theme")) as Theme | null;
    if (stored) setTheme(stored);
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("av-theme", theme);
  }, [theme]);

  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => React.useContext(ThemeCtx);
