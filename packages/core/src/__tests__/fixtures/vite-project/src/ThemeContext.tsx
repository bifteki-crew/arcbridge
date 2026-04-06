import { createContext, useContext } from "react";

interface ThemeContextType {
  theme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType>({ theme: "light" });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme: "light" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemedButton() {
  const { theme } = useContext(ThemeContext);
  return <button className={theme}>Click me</button>;
}
