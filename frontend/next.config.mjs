/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export to GitHub Pages. Nothing here needs a server: the schedule
  // is imported at build time and the board is computed in the browser.
  output: "export",
  // Served from https://fazleras.github.io/pace-tracker/, not the domain root.
  basePath: "/pace-tracker",
};

export default nextConfig;
