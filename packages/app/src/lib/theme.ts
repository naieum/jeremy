export type Theme = "blue" | "blue-inverse" | "cream" | "cream-inverse";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "blue";
  return (localStorage.getItem("jeremy-theme") as Theme) ?? "blue";
}

export function setTheme(theme: Theme) {
  localStorage.setItem("jeremy-theme", theme);
  if (theme === "blue") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function initTheme() {
  const theme = getTheme();
  if (theme !== "blue") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}
