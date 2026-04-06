import { Counter } from "./Counter";
import { ThemeProvider, ThemedButton } from "./ThemeContext";

export function App() {
  return (
    <ThemeProvider>
      <div>
        <h1>Hello Vite</h1>
        <Counter initial={0} />
        <ThemedButton />
      </div>
    </ThemeProvider>
  );
}
